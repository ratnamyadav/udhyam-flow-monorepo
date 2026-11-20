// Android App Links: verifies the `autoVerify` intent filter in
// apps/mobile/app.json so /book/… links open the app. Needs the SHA-256
// fingerprints of the app signing key(s) — the Play App Signing key from
// Play Console, plus the upload key from `eas credentials` — comma-separated.
const ANDROID_PACKAGE = 'com.udyamflow.app';

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  if (!fingerprints.length) return new Response('Not configured', { status: 404 });
  return Response.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
