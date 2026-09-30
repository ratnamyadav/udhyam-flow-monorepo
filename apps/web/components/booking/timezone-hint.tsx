'use client';

import { useEffect, useState } from 'react';
import { browserTimezone } from '@/lib/timezones';

// Locales tried, in order, for a human abbreviation ("IST", "EDT", "BST").
// The visitor's own locale comes first; the English fallbacks cover zones
// whose abbreviation only exists in a regional locale (e.g. IST in en-IN).
const ABBREV_LOCALES: Array<string | undefined> = [undefined, 'en-US', 'en-GB', 'en-IN', 'en-AU'];
const OFFSET_ONLY = /^(GMT|UTC)([+\-−]\d|$)/;

function zoneName(timeZone: string, locale: string | undefined, style: 'short' | 'shortOffset') {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? null
    );
  } catch {
    return null;
  }
}

/** Short zone label such as "IST"; falls back to an offset like "GMT+4". */
export function shortZoneName(timeZone: string): string | null {
  let offset: string | null = null;
  for (const locale of ABBREV_LOCALES) {
    const name = zoneName(timeZone, locale, 'short');
    if (!name) continue;
    if (!OFFSET_ONLY.test(name)) return name;
    offset ??= name;
  }
  return offset ?? zoneName(timeZone, undefined, 'shortOffset');
}

/** IANA id as the runtime canonicalises it (Asia/Calcutta ≡ Asia/Kolkata). */
function canonicalZone(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * "Times shown in Asia/Kolkata (IST)" — rendered only when the location's
 * zone differs from the visitor's. The visitor's zone is read after mount so
 * server and first client render match (no hydration mismatch).
 */
export function TimezoneHint({ timezone, className }: { timezone: string; className?: string }) {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const visitor = browserTimezone();
    if (canonicalZone(visitor) === canonicalZone(timezone)) {
      setHint(null);
      return;
    }
    const short = shortZoneName(timezone);
    setHint(`Times shown in ${timezone}${short ? ` (${short})` : ''}`);
  }, [timezone]);

  if (!hint) return null;
  return <p className={`text-[11px] text-ink-mute m-0 ${className ?? ''}`}>{hint}</p>;
}
