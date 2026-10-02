import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = process.argv[2] ?? process.cwd();
const require = createRequire(`${root}/apps/mobile/package.json`);
const esbuild = createRequire(`${root}/node_modules/.pnpm/node_modules/esbuild/package.json`)(
  './lib/main.js',
);
for (const platform of ['ios', 'android']) {
  const entry = createRequire(`${root}/packages/auth/package.json`).resolve(
    '@better-auth/expo/client',
  );
  const bundle = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'isolated-native-host',
        setup(build) {
          build.onResolve(
            {
              filter: /^(react-native|expo-constants|expo-linking|expo-web-browser|expo-network)$/,
            },
            (args) => ({ path: args.path, namespace: 'test-host' }),
          );
          build.onLoad({ filter: /.*/, namespace: 'test-host' }, (args) => ({
            contents:
              args.path === 'react-native'
                ? `export const Platform={OS:'${platform}'};export const AppState={currentState:'active',addEventListener:()=>({remove(){}})};`
                : args.path === 'expo-constants'
                  ? `export default {expoConfig:{scheme:'udyamflow'}};`
                  : `export function createURL(path){return 'udyamflow://'+path;}export function addEventListener(){return {remove(){}};}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const file = `/tmp/udyamflow-otp-native-test/client-${platform}.cjs`;
  await writeFile(file, bundle.outputFiles[0].text);
  const { expoClient } = require(file);
  const memory = new Map();
  const storage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    getItemAsync: async (k) => memory.get(k) ?? null,
    setItemAsync: async (k, v) => {
      memory.set(k, v);
    },
  };
  const state = { data: null, error: null, isPending: false };
  let notified = 0;
  const store = {
    notify: () => notified++,
    atoms: { session: { get: () => state, set: (value) => Object.assign(state, value) } },
  };
  const plugin = expoClient({ scheme: 'udyamflow', storagePrefix: 'udyamflow', storage });
  const actions = plugin.getActions(null, store);
  const hook = plugin.fetchPlugins[0].hooks.onSuccess;
  await hook({
    request: { url: 'https://example.test/api/auth/sign-in/email-otp', body: '{}' },
    response: new Response('{}', {
      headers: {
        'set-cookie':
          'better-auth.session_token=synthetic-otp-session; Max-Age=3600; Path=/; HttpOnly',
      },
    }),
    data: { redirect: false },
  });
  assert.match(await actions.getCookie(), /better-auth.session_token=synthetic-otp-session/);
  assert.ok(notified > 0);
  const restarted = expoClient({ scheme: 'udyamflow', storagePrefix: 'udyamflow', storage });
  const restartedActions = restarted.getActions(null, store);
  assert.match(
    await restartedActions.getCookie(),
    /better-auth.session_token=synthetic-otp-session/,
  );
  const session = {
    user: { id: 'synthetic-user' },
    session: { id: 'synthetic-session', expiresAt: new Date(Date.now() + 3600000).toISOString() },
  };
  await hook({
    request: { url: 'https://example.test/api/auth/get-session' },
    response: new Response('{}'),
    data: session,
  });
  assert.equal(JSON.parse(memory.get('udyamflow_session_data')).user.id, 'synthetic-user');
  await hook({
    request: { url: 'https://example.test/api/auth/sign-out' },
    response: new Response('{}'),
    data: { success: true },
  });
  assert.equal(await actions.getCookie(), '');
  assert.equal(state.data, null);
  console.log(
    `${platform}: actual Expo1.7.7 plugin stores OTP-session cookie, notifies session, survives client restart, caches get-session, and clears on sign-out; host APIs/storage mocked; no network/device exercised.`,
  );
}
