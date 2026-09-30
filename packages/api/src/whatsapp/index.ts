// Entry point for the Next route handlers (cron + MSG91 inbound webhook),
// exposed as `@udyamflow/api/whatsapp` so they can call these directly —
// there's no user session on those requests, so no tRPC caller either.

export { bearerToken, secretsMatch } from '../shared-secret';
export { handleInboundWhatsApp, type InboundOutcome } from './handle-inbound';
export { type ReminderRunResult, runReminders } from './run-reminders';
