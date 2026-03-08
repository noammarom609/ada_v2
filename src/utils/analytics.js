/**
 * Analytics & Error Reporting utility.
 * Wraps Sentry (errors) and PostHog (usage analytics).
 * Respects privacy mode — when enabled, no telemetry is sent.
 */

import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

let initialized = false;
let privacyMode = false;

// ── Privacy Mode ──────────────────────────────────────────────

export function isPrivacyMode() {
    return privacyMode || localStorage.getItem('dvirious_privacy_mode') === 'true';
}

export function setPrivacyMode(enabled) {
    privacyMode = enabled;
    localStorage.setItem('dvirious_privacy_mode', String(enabled));

    if (enabled) {
        // Disable all tracking
        if (posthog.__loaded) {
            posthog.opt_out_capturing();
        }
        console.log('[Analytics] Privacy mode ON — telemetry disabled');
    } else {
        if (posthog.__loaded) {
            posthog.opt_in_capturing();
        }
        console.log('[Analytics] Privacy mode OFF — telemetry enabled');
    }
}

// ── Initialization ────────────────────────────────────────────

export function initAnalytics(userId, userPlan) {
    if (initialized) return;
    initialized = true;

    privacyMode = isPrivacyMode();

    // Sentry — always init for crash reporting (respects privacy below)
    if (SENTRY_DSN) {
        try {
            const Sentry = require('@sentry/electron/renderer');
            Sentry.init({
                dsn: SENTRY_DSN,
                environment: import.meta.env.MODE || 'production',
                beforeSend(event) {
                    if (isPrivacyMode()) return null; // Drop event
                    return event;
                },
            });
            if (userId) {
                Sentry.setUser({ id: userId });
            }
            console.log('[Sentry] Initialized');
        } catch (err) {
            console.warn('[Sentry] Init failed:', err.message);
        }
    }

    // PostHog — usage analytics
    if (POSTHOG_KEY && !isPrivacyMode()) {
        try {
            posthog.init(POSTHOG_KEY, {
                api_host: POSTHOG_HOST,
                autocapture: false,
                capture_pageview: false,
                persistence: 'localStorage',
                loaded: (ph) => {
                    if (userId) {
                        ph.identify(userId, {
                            plan: userPlan || 'free',
                        });
                    }
                },
            });
            console.log('[PostHog] Initialized');
        } catch (err) {
            console.warn('[PostHog] Init failed:', err.message);
        }
    }
}

// ── Event Tracking ────────────────────────────────────────────

export function trackEvent(eventName, properties = {}) {
    if (isPrivacyMode()) return;

    try {
        if (posthog.__loaded) {
            posthog.capture(eventName, properties);
        }
    } catch {
        // Silent fail
    }
}

// Pre-defined events
export const Events = {
    appOpened: () => trackEvent('app_opened'),
    sessionStarted: (plan) => trackEvent('session_started', { plan }),
    sessionEnded: (durationMin) => trackEvent('session_ended', { duration_minutes: durationMin }),
    toolUsed: (tool) => trackEvent('tool_used', { tool }),
    cadGenerated: () => trackEvent('cad_generated'),
    webAgentTask: () => trackEvent('web_agent_task'),
    printerConnected: () => trackEvent('printer_connected'),
    kasaDeviceFound: (count) => trackEvent('kasa_device_found', { count }),
    planUpgraded: (from, to) => trackEvent('plan_upgraded', { from_plan: from, to_plan: to }),
    featureToggled: (feature, enabled) => trackEvent('feature_toggled', { feature, enabled }),
    errorOccurred: (error, context) => trackEvent('error_occurred', { error, context }),
};

// ── Identify User ─────────────────────────────────────────────

export function identifyUser(userId, traits = {}) {
    if (isPrivacyMode()) return;

    try {
        if (posthog.__loaded) {
            posthog.identify(userId, traits);
        }
    } catch {
        // Silent fail
    }
}

// ── Reset (on logout) ─────────────────────────────────────────

export function resetAnalytics() {
    try {
        if (posthog.__loaded) {
            posthog.reset();
        }
    } catch {
        // Silent fail
    }
}
