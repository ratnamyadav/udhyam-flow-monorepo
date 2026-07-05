import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://udyamflow.com';

// Marketing surfaces only. Tenant booking pages are noindex (per
// generateMetadata in app/book/[orgSlug]/page.tsx).

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/sign-in`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/sign-up`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
