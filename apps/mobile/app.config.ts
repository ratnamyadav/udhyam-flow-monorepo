import type { ConfigContext, ExpoConfig } from 'expo/config';
import './load-root-env';

// Static config lives in app.json; this wrapper exists so the monorepo root
// .env (EXPO_PUBLIC_AUTH_URL, …) is loaded before Expo reads the environment.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'UdyamFlow',
  slug: config.slug ?? 'udyamflow',
});
