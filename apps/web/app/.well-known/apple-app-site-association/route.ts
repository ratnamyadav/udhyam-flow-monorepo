// iOS universal links: lets https://udyamflow.com/book/… open the app
// (`associatedDomains` in apps/mobile/app.json). Needs APPLE_TEAM_ID.
const IOS_BUNDLE_ID = 'com.udyamflow.app';

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  if (!teamId) return new Response('Not configured', { status: 404 });
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: [`${teamId}.${IOS_BUNDLE_ID}`],
            components: [{ '/': '/book/*', comment: 'Public booking pages' }],
          },
        ],
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
