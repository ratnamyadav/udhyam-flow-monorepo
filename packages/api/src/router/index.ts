import { router } from '../trpc';
import { authRouter } from './auth';
import { bookingRouter } from './booking';
import { locationRouter } from './location';
import { onboardingRouter } from './onboarding';
import { resourceRouter } from './resource';
import { tenantRouter } from './tenant';

export const appRouter = router({
  auth: authRouter,
  tenant: tenantRouter,
  onboarding: onboardingRouter,
  location: locationRouter,
  resource: resourceRouter,
  booking: bookingRouter,
});

export type AppRouter = typeof appRouter;
