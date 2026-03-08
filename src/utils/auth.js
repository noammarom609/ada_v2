/**
 * Auth utility — production-grade token management, cloud API calls, and session state.
 * Tokens are stored in localStorage (Electron app, single user).
 *
 * Features:
 * - Mutex-protected token refresh (prevents race conditions)
 * - Retry with exponential backoff on transient failures
 * - Silent session recovery on app focus
 * - Proactive refresh 120s before expiry
 */

const CLOUD_API_URL =
    localStorage.getItem('cloud_api_url') ||
    import.meta.env.VITE_CLOUD_API_URL ||
    'https://dvirius-m7f7.vercel.app';

const TOKEN_KEYS = {
    access: 'dvirious_access_token',
    refresh: 'dvirious_refresh_token',
    expiresAt: 'dvirious_token_expires_at',
    userId: 'dvirious_user_id',
    email: 'dvirious_email',
    plan: 'dvirious_plan',
};

// ── Token Storage ──────────────────────────────────────────────

export function saveTokens({ access_token, refresh_token, expires_at, user_id, email }) {
    if (access_token) localStorage.setItem(TOKEN_KEYS.access, access_token);
    if (refresh_token) localStorage.setItem(TOKEN_KEYS.refresh, refresh_token);
    if (expires_at) localStorage.setItem(TOKEN_KEYS.expiresAt, String(expires_at));
    if (user_id) localStorage.setItem(TOKEN_KEYS.userId, user_id);
    if (email) localStorage.setItem(TOKEN_KEYS.email, email);
}

export function getAccessToken() {
    return localStorage.getItem(TOKEN_KEYS.access);
}

export function getRefreshToken() {
    return localStorage.getItem(TOKEN_KEYS.refresh);
}

export function getUserId() {
    return localStorage.getItem(TOKEN_KEYS.userId);
}

export function getUserEmail() {
    return localStorage.getItem(TOKEN_KEYS.email);
}

export function getUserPlan() {
    return localStorage.getItem(TOKEN_KEYS.plan) || 'free';
}

export function isLoggedIn() {
    return !!getAccessToken();
}

export function clearTokens() {
    Object.values(TOKEN_KEYS).forEach((key) => localStorage.removeItem(key));
}

// ── Token Refresh (Mutex-Protected) ──────────────────────────

let _refreshPromise = null;

export function isTokenExpired() {
    const expiresAt = localStorage.getItem(TOKEN_KEYS.expiresAt);
    if (!expiresAt) return true;
    // Refresh 120 seconds before actual expiry (doubled from 60 for safety)
    return Date.now() / 1000 > Number(expiresAt) - 120;
}

/**
 * Refresh the access token. Uses a mutex so concurrent callers
 * share the same in-flight request instead of firing multiple refreshes.
 */
export async function refreshAccessToken() {
    // If a refresh is already in progress, piggyback on it
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = _doRefresh();
    try {
        return await _refreshPromise;
    } finally {
        _refreshPromise = null;
    }
}

async function _doRefresh() {
    const refresh = getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    const res = await fetch(`${CLOUD_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
    });

    if (!res.ok) {
        // Only clear tokens on definitive auth failures (4xx), not transient (5xx)
        if (res.status >= 400 && res.status < 500) {
            clearTokens();
        }
        throw new Error(`Token refresh failed (${res.status})`);
    }

    const data = await res.json();
    saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
    });
    return data.access_token;
}

/**
 * Returns a valid access token, refreshing if needed.
 */
export async function getValidToken() {
    if (!isLoggedIn()) return null;
    if (isTokenExpired()) {
        try {
            return await refreshAccessToken();
        } catch {
            return null;
        }
    }
    return getAccessToken();
}

// ── Cloud API Helpers (with retry) ───────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // ms

async function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Authenticated fetch with automatic retry on transient failures.
 * On 401: attempts one silent token refresh before giving up.
 */
async function cloudFetch(path, options = {}) {
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const token = await getValidToken();
            if (!token) throw new Error('Not authenticated');

            const res = await fetch(`${CLOUD_API_URL}${path}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...(options.headers || {}),
                },
            });

            if (res.status === 401 && attempt === 0) {
                // Token might have just expired — force one refresh and retry
                try {
                    await refreshAccessToken();
                    continue; // retry with new token
                } catch {
                    clearTokens();
                    throw new Error('Session expired');
                }
            }

            if (res.status === 401) {
                clearTokens();
                throw new Error('Session expired');
            }

            // Transient server errors — retry
            if (res.status >= 500 && attempt < MAX_RETRIES) {
                await _sleep(RETRY_DELAYS[attempt]);
                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `API error (${res.status})`);
            }

            return res.json();
        } catch (err) {
            lastError = err;
            // Don't retry auth errors or non-network issues
            if (
                err.message === 'Session expired' ||
                err.message === 'Not authenticated'
            ) {
                throw err;
            }
            // Retry on network errors (fetch throws TypeError on network failure)
            if (attempt < MAX_RETRIES && err instanceof TypeError) {
                await _sleep(RETRY_DELAYS[attempt]);
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

export async function fetchProfile() {
    return cloudFetch('/users/me');
}

export async function createAiSession() {
    return cloudFetch('/ai/session', { method: 'POST' });
}

export async function reportUsage(minutes, cadCount = 0, webCount = 0) {
    return cloudFetch(
        `/ai/usage-report?minutes=${minutes}&cad_count=${cadCount}&web_count=${webCount}`,
        { method: 'POST' }
    );
}

export async function syncSettings(settings) {
    return cloudFetch('/users/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
    });
}

// ── Auth Actions ───────────────────────────────────────────────

export async function loginWithEmail(email, password) {
    const res = await fetch(`${CLOUD_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(err.detail || 'Login failed');
    }

    const data = await res.json();
    saveTokens(data);
    localStorage.setItem(TOKEN_KEYS.plan, data.plan || 'free');
    return data;
}

export async function signupWithEmail(email, password, displayName = '') {
    const res = await fetch(`${CLOUD_API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, display_name: displayName }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Signup failed' }));
        throw new Error(err.detail || 'Signup failed');
    }

    const data = await res.json();
    saveTokens(data);
    return data;
}

export async function getOAuthUrl(provider = 'google') {
    const res = await fetch(`${CLOUD_API_URL}/auth/oauth-url?provider=${provider}`);
    if (!res.ok) throw new Error('Failed to get OAuth URL');
    const data = await res.json();
    return data.url;
}

export function logout() {
    clearTokens();
    localStorage.removeItem('setup_complete');
}

// ── Session Validation on App Focus ────────────────────────────

let _focusListenerAttached = false;

/**
 * Call once at app startup. Validates the session when the user
 * returns to the app (e.g., after sleep/hibernate/alt-tab).
 * Calls onSessionExpired if the session can't be recovered.
 */
export function setupSessionWatcher(onSessionExpired) {
    if (_focusListenerAttached) return;
    _focusListenerAttached = true;

    const handleFocus = async () => {
        if (!isLoggedIn()) return;
        if (isTokenExpired()) {
            try {
                await refreshAccessToken();
            } catch {
                onSessionExpired();
            }
        }
    };

    window.addEventListener('focus', handleFocus);

    // Also check periodically (every 5 minutes) in case app stays in focus
    setInterval(() => {
        if (isLoggedIn() && isTokenExpired()) {
            refreshAccessToken().catch(() => onSessionExpired());
        }
    }, 5 * 60 * 1000);
}

export { CLOUD_API_URL };
