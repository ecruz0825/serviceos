import * as Sentry from "@sentry/react";

let _sentryInitialized = false;

export function initSentry({ role }) {
  // If already initialized, just update the role tag
  if (_sentryInitialized) {
    Sentry.setTag("role", role);
    return;
  }

  if (!import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: import.meta.env.MODE,
    release: `lawncare-app@${import.meta.env.VITE_APP_VERSION || "dev"}`,
    beforeSend(event) {
      // Sanitize event: remove any sensitive info automatically
      if (event.request) {
        delete event.request.headers;
      }
      return event;
    },
  });

  _sentryInitialized = true;
  Sentry.setTag("role", role);
}

export function setUserContext({ user, companyId }) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.setUser({
    id: user?.id || null,
    company_id: companyId || null,
  });
}
