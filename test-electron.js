const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('app type:', typeof electron.app);
if (electron.app) {
    electron.app.on('ready', () => {
        console.log('APP READY - Electron works!');
        electron.app.quit();
    });
} else {
    console.log('FAILED - app is undefined');
    process.exit(1);
}
