// error-tracker.ts — ERROR TRACKER HOOK (#34).
//
// The single place to plug in an error tracker (Sentry, Better Stack, …).
// Every server request error (src/instrumentation.ts) and every error
// boundary in the browser (error.tsx, global-error.tsx) passes through
// `captureError` after its JSON log line has been written, with the same
// fields: source, tenant slug, route, digest and the error's class name.
//
// No tracker is wired up yet, so this does nothing. To add Sentry, for
// example: install `@sentry/nextjs`, initialise it in `register()` of
// src/instrumentation.ts and in src/instrumentation-client.ts, then call
//
//   Sentry.captureException(error, {
//     tags: { tenant: fields.tenant ?? "none", source: fields.source },
//     extra: fields,
//   });
//
// here. Keep personal data out (scrub messages in `beforeSend`), and choose
// an EU data region. The caller already guards against this throwing.

import type { ErrorFields } from "./error-reporting";

export function captureError(_error: unknown, _fields: ErrorFields): void {
	// Intentionally empty until an error tracker is chosen.
}
