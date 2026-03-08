const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// ── Sentry Error Reporting (Main Process) ──────────────────
const SENTRY_DSN = process.env.VITE_SENTRY_DSN || '';
if (SENTRY_DSN) {
    try {
        const Sentry = require('@sentry/electron/main');
        Sentry.init({ dsn: SENTRY_DSN });
        console.log('[Sentry] Main process initialized');
    } catch (err) {
        console.warn('[Sentry] Main process init skipped:', err.message);
    }
}

app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-features', 'Vulkan');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const isDev = !app.isPackaged;

// ── Deep Link Protocol (dvirious://auth/callback) ──────────────
const PROTOCOL = 'dvirious';

if (isDev) {
    // In dev, register the protocol for the current executable
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
    ]);
} else {
    app.setAsDefaultProtocolClient(PROTOCOL);
}

// Windows: handle protocol URL from second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        // The deep link URL is typically the last argument
        const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
        if (url) {
            handleAuthDeepLink(url);
        }
        // Focus the existing window
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function handleAuthDeepLink(url) {
    console.log('[Auth] Deep link received:', url);
    // Parse the URL: dvirious://auth/callback#access_token=...&refresh_token=...
    try {
        // Supabase puts tokens in the URL fragment (hash)
        const hashIndex = url.indexOf('#');
        const queryIndex = url.indexOf('?');
        const paramString =
            hashIndex !== -1
                ? url.substring(hashIndex + 1)
                : queryIndex !== -1
                ? url.substring(queryIndex + 1)
                : '';

        const params = new URLSearchParams(paramString);
        const authData = {
            access_token: params.get('access_token'),
            refresh_token: params.get('refresh_token'),
            expires_at: params.get('expires_at'),
            token_type: params.get('token_type'),
        };

        if (authData.access_token && mainWindow) {
            // Send tokens to the renderer process
            mainWindow.webContents.send('auth-callback', authData);
            console.log('[Auth] Tokens forwarded to renderer');
        }
    } catch (err) {
        console.error('[Auth] Failed to parse deep link:', err.message);
    }
}

let mainWindow;
let pythonProcess;

function getResourcePath(relativePath) {
    if (isDev) {
        return path.join(__dirname, '..', relativePath);
    }
    return path.join(process.resourcesPath, relativePath);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        backgroundColor: '#000000',
        frame: false,
        titleBarStyle: 'hidden',
        show: false,
    });

    const loadFrontend = (retries = 3) => {
        const loadPromise = isDev
            ? mainWindow.loadURL('http://localhost:5180')
            : mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

        loadPromise
            .then(() => {
                console.log('Frontend loaded successfully!');
                windowWasShown = true;
                mainWindow.show();

            })
            .catch((err) => {
                console.error(`Failed to load frontend: ${err.message}`);
                if (retries > 0) {
                    console.log(`Retrying in 1 second... (${retries} retries left)`);
                    setTimeout(() => loadFrontend(retries - 1), 1000);
                } else {
                    console.error('Failed to load frontend after all retries. Keeping window open.');
                    windowWasShown = true;
                    mainWindow.show();
                }
            });
    };

    loadFrontend();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startPythonBackend() {
    const backendDir = getResourcePath('backend');
    const scriptPath = path.join(backendDir, 'server.py');
    console.log(`Starting Python backend: ${scriptPath}`);

    pythonProcess = spawn('python', [scriptPath], {
        cwd: backendDir,
        env: { ...process.env },
    });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`[Python]: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[Python Error]: ${data}`);
    });

    pythonProcess.on('error', (err) => {
        console.error(`Failed to start Python backend: ${err.message}`);
    });
}

app.whenReady().then(() => {
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close();
    });

    checkBackendPort(8001).then((isTaken) => {
        if (isTaken) {
            console.log('Port 8001 is taken. Assuming backend is already running manually.');
            waitForBackend().then(createWindow);
        } else {
            startPythonBackend();
            setTimeout(() => {
                waitForBackend().then(createWindow);
            }, 1000);
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // macOS: handle deep link when app is already running
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleAuthDeepLink(url);
    });

    // ── Auto-Updater (GitHub Releases) ──────────────────────────
    if (!isDev) {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('checking-for-update', () => {
            console.log('[Updater] Checking for updates...');
        });

        autoUpdater.on('update-available', (info) => {
            console.log('[Updater] Update available:', info.version);
            if (mainWindow) {
                mainWindow.webContents.send('update-status', {
                    status: 'downloading',
                    version: info.version,
                });
            }
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[Updater] App is up to date.');
        });

        autoUpdater.on('download-progress', (progress) => {
            console.log(`[Updater] Download: ${Math.round(progress.percent)}%`);
            if (mainWindow) {
                mainWindow.webContents.send('update-status', {
                    status: 'progress',
                    percent: Math.round(progress.percent),
                });
            }
        });

        autoUpdater.on('update-downloaded', (info) => {
            console.log('[Updater] Update downloaded:', info.version);
            if (mainWindow) {
                mainWindow.webContents.send('update-status', {
                    status: 'ready',
                    version: info.version,
                });
            }
        });

        autoUpdater.on('error', (err) => {
            console.error('[Updater] Error:', err.message);
        });

        // Check for updates after window is ready (delay to avoid startup load)
        setTimeout(() => {
            autoUpdater.checkForUpdatesAndNotify().catch((err) =>
                console.error('[Updater] Check failed:', err.message)
            );
        }, 10000);

        // Also handle manual restart request from renderer
        ipcMain.on('install-update', () => {
            autoUpdater.quitAndInstall();
        });
    }
});

function checkBackendPort(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

function waitForBackend() {
    return new Promise((resolve) => {
        const check = () => {
            const http = require('http');
            http.get('http://127.0.0.1:8001/status', (res) => {
                if (res.statusCode === 200) {
                    console.log('Backend is ready!');
                    resolve();
                } else {
                    console.log('Backend not ready, retrying...');
                    setTimeout(check, 1000);
                }
            }).on('error', (err) => {
                console.log('Waiting for backend...');
                setTimeout(check, 1000);
            });
        };
        check();
    });
}

let windowWasShown = false;

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && windowWasShown) {
        app.quit();
    } else if (!windowWasShown) {
        console.log('Window was never shown - keeping app alive to allow retries');
    }
});

app.on('will-quit', () => {
    console.log('App closing... Killing Python backend.');
    if (pythonProcess) {
        if (process.platform === 'win32') {
            try {
                const { execSync } = require('child_process');
                execSync(`taskkill /pid ${pythonProcess.pid} /f /t`);
            } catch (e) {
                console.error('Failed to kill python process:', e.message);
            }
        } else {
            pythonProcess.kill('SIGKILL');
        }
        pythonProcess = null;
    }
});
