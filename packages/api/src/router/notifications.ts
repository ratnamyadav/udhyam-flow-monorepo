import { isMsg91Configured } from '@udyamflow/notifications';
import { publicProcedure, router } from '../trpc';

// Surfaces server-side notification configuration to the UI so we can
// disable per-tenant SMS/WhatsApp toggles when the gateway isn't wired.

export const notificationsRouter = router({
  status: publicProcedure.query(() => ({
    msg91: isMsg91Configured(),
    resend: !!process.env.RESEND_API_KEY,
  })),
});
