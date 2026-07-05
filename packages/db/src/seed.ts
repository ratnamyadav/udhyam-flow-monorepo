// Seeds the three demo tenants (Patel Clinic, Kavya's Math Studio, Baseline Sports)
// with their themes, one location each, and sample resources from PROFESSIONS so
// the booking page + dashboard render against real data immediately.
//
// Usage: pnpm db:seed (resolves DATABASE_URL from the repo-root .env)

import { randomUUID } from 'node:crypto';
import { PROFESSIONS, TENANT_LIST } from '@udyamflow/tokens';
import { db } from './client';
import { location, organization, resource, resourceHours, tenantSettings } from './schema';

async function main() {
  console.log('Seeding UdyamFlow demo tenants…');

  for (const t of TENANT_LIST) {
    const orgId = `org_${t.id}`;
    const locId = `loc_${t.id}`;
    const profession = PROFESSIONS[t.profession];

    await db
      .insert(organization)
      .values({ id: orgId, name: t.name, slug: t.slug, logo: t.logo })
      .onConflictDoNothing();

    await db
      .insert(tenantSettings)
      .values({
        organizationId: orgId,
        profession: t.profession,
        templateId: t.profession,
        logoText: t.logo,
        accent: t.accent,
        accentSoft: t.accentSoft,
        accentInk: t.accentInk,
        fontDisplay: t.fontDisplay,
        fontUi: t.fontUI,
        radius: t.radius,
        density: 'comfortable',
        currency: t.id === 'baseline' ? 'INR' : t.id === 'patel' ? 'INR' : 'USD',
        onboardingStep: 5,
      })
      .onConflictDoNothing();

    await db
      .insert(location)
      .values({
        id: locId,
        organizationId: orgId,
        name: t.location,
        timezone: 'Asia/Kolkata',
        currency: t.id === 'kavya' ? 'USD' : 'INR',
      })
      .onConflictDoNothing();

    for (const r of profession.sampleResources) {
      const resId = `res_${t.id}_${r.avatar.toLowerCase()}_${randomUUID().slice(0, 6)}`;
      await db
        .insert(resource)
        .values({
          id: resId,
          organizationId: orgId,
          locationId: locId,
          name: r.name,
          title: r.title,
          avatar: r.avatar,
        })
        .onConflictDoNothing();

      // Default Mon–Fri 09:00–18:00 so the public booking page renders slots.
      for (let day = 1; day <= 5; day++) {
        await db
          .insert(resourceHours)
          .values({ resourceId: resId, dayOfWeek: day, openMin: 9 * 60, closeMin: 18 * 60 })
          .onConflictDoNothing();
      }
    }

    console.log(`  ✓ ${t.name} (${t.slug})`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
