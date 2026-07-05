// Compatibility re-export. Email delivery now lives in @udyamflow/notifications;
// this shim keeps existing `import { sendEmail } from './email'` working from
// server.ts without a refactor.

export { sendEmail } from '@udyamflow/notifications/email';
