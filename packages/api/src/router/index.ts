import { router } from '../trpc';
import { adminRouter } from './admin';
import { authRouter } from './auth';
import { bookingRouter } from './booking';
import { channelsRouter } from './channels';
import { customerRouter } from './customer';
import { invoicingRouter } from './invoicing';
import { locationRouter } from './location';
import { membershipRouter } from './membership';
import { notificationsRouter } from './notifications';
import { onboardingRouter } from './onboarding';
import { paymentRouter } from './payment';
import { reportRouter } from './report';
import { resourceRouter } from './resource';
import { serviceRouter } from './service';
import { teamRouter } from './team';
import { tenantRouter } from './tenant';

export const appRouter = router({
  auth: authRouter,
  tenant: tenantRouter,
  onboarding: onboardingRouter,
  location: locationRouter,
  resource: resourceRouter,
  service: serviceRouter,
  booking: bookingRouter,
  customer: customerRouter,
  team: teamRouter,
  notifications: notificationsRouter,
  payment: paymentRouter,
  invoicing: invoicingRouter,
  report: reportRouter,
  channels: channelsRouter,
  membership: membershipRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
