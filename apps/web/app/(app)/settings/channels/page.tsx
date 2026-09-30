'use client';

import { useState } from 'react';
import { SkeletonRow } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/react';

// Booking channels — the same public booking page, shared with a `?source=`
// tag per channel so bookings can be attributed (Google Business Profile,
// Instagram bio, WhatsApp Business). The table counts bookings created in the
// last 30 days by source; untagged links show as "Direct".

const CHANNEL_LABELS: Record<string, string> = {
  google: 'Google Business Profile',
  instagram: 'Instagram bio',
  whatsapp: 'WhatsApp',
};

export default function ChannelsSettingsPage() {
  const overview = trpc.channels.overview.useQuery();
  const data = overview.data;

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Channels
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Booking channels</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          Share your booking page wherever customers find you. Each link below carries a source tag,
          so you can see which channel brings in bookings.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-xl">
            <div className="px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
              Your booking links
            </div>
            {overview.isLoading ? (
              <>
                <SkeletonRow cols={2} />
                <SkeletonRow cols={2} />
              </>
            ) : data ? (
              <>
                <LinkRow label="Booking page" url={data.bookingUrl} />
                {data.links.map((l) => (
                  <LinkRow
                    key={l.source}
                    label={CHANNEL_LABELS[l.source] ?? l.source}
                    url={l.url}
                  />
                ))}
              </>
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">
                {overview.error?.message ?? 'Could not load your booking links.'}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl">
            <div className="grid grid-cols-[1fr_120px_120px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
              <div>Source · last 30 days</div>
              <div className="text-right">Bookings</div>
              <div className="text-right">Cancelled</div>
            </div>
            {overview.isLoading ? (
              <>
                <SkeletonRow cols={3} />
                <SkeletonRow cols={3} />
              </>
            ) : data && data.bySource.length > 0 ? (
              data.bySource.map((r) => (
                <div
                  key={r.source ?? '__direct'}
                  className="grid grid-cols-[1fr_120px_120px] px-5 py-3 border-t border-border first:border-t-0 items-center text-[13px]"
                >
                  <div className="text-ink">
                    {r.source ? (CHANNEL_LABELS[r.source] ?? r.source) : 'Direct / untagged'}
                    {r.source && (
                      <span className="ml-2 font-mono text-[11px] text-ink-soft">{r.source}</span>
                    )}
                  </div>
                  <div className="text-right font-mono tabular-nums text-ink">{r.total}</div>
                  <div className="text-right font-mono tabular-nums text-ink-mute">
                    {r.cancelled}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">
                No bookings in the last 30 days yet.
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 space-y-5 h-fit text-[13px] text-ink-mute">
          <HowTo title="Google Business Profile">
            <li>Open your profile on Google Search or Maps and choose Edit profile.</li>
            <li>
              Go to <strong className="text-ink">Contact → Appointment links</strong>.
            </li>
            <li>Paste the Google Business Profile link from the left and save.</li>
            <li>
              A &ldquo;Book online&rdquo; button appears on your profile once Google reviews it.
            </li>
          </HowTo>
          <HowTo title="Instagram bio">
            <li>Edit profile → Links → Add external link.</li>
            <li>Paste the Instagram link and give it a title like &ldquo;Book now&rdquo;.</li>
          </HowTo>
          <HowTo title="WhatsApp Business">
            <li>Business tools → Catalog: add an item (e.g. &ldquo;Book an appointment&rdquo;).</li>
            <li>Paste the WhatsApp link as the item link — or use it in your greeting message.</li>
          </HowTo>
        </div>
      </div>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-[180px_1fr_80px] gap-4 px-5 py-3 border-t border-border first:border-t-0 items-center">
      <div className="text-[13px] text-ink">{label}</div>
      <div className="text-[12px] font-mono text-ink-mute truncate" title={url}>
        {url}
      </div>
      <button
        type="button"
        className="text-[12px] text-ink-mute hover:text-ink text-right"
        onClick={() => {
          navigator.clipboard
            .writeText(url)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
        }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

function HowTo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono mb-2">
        {title}
      </div>
      <ol className="list-decimal pl-4 space-y-1 leading-relaxed">{children}</ol>
    </div>
  );
}
