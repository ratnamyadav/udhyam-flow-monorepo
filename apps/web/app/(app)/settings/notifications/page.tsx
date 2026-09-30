'use client';

import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

// Customer-facing confirmation channels. Each switch saves the moment it's
// flipped — there's no separate Save button on this page.
export default function NotificationsSettingsPage() {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const status = trpc.notifications.status.useQuery();
  const settings = trpc.tenant.getSettings.useQuery();
  const update = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => utils.tenant.getSettings.invalidate(),
  });

  const configured = status.data?.msg91 ?? false;
  const loading = settings.isLoading || status.isLoading;

  const channels = [
    {
      key: 'enableSms' as const,
      label: 'SMS confirmations',
      body: 'Text customers their booking details and reference when a booking is confirmed.',
      on: settings.data?.enableSms ?? false,
    },
    {
      key: 'enableWhatsapp' as const,
      label: 'WhatsApp confirmations',
      body: 'Send the same confirmation over WhatsApp to customers who gave a phone number.',
      on: settings.data?.enableWhatsapp ?? false,
    },
  ];

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Notifications
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Notifications</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          Choose how customers hear about their bookings. Customers who leave an email address
          always get an email confirmation.{' '}
          <strong className="text-ink">Changes on this page save instantly</strong> — there's no
          Save button.
        </p>
      </div>

      {!isAdmin && <MemberNote what="change notification settings" />}

      <div className="max-w-[640px] bg-surface border border-border rounded-xl divide-y divide-border">
        {channels.map((c) => {
          const inputId = `notif-${c.key}`;
          return (
            <div key={c.key} className="flex items-start justify-between gap-6 px-5 py-4">
              <div>
                <label htmlFor={inputId} className="text-[14px] font-medium text-ink">
                  {c.label}
                </label>
                <div className="text-[12px] text-ink-mute mt-0.5 leading-relaxed">
                  {c.body} Sent via MSG91.
                </div>
              </div>
              <input
                id={inputId}
                type="checkbox"
                role="switch"
                aria-checked={c.on}
                className="mt-1 w-4 h-4 accent-ink"
                checked={c.on}
                disabled={loading || !configured || !isAdmin || update.isPending}
                onChange={(e) =>
                  update.mutate(
                    c.key === 'enableSms'
                      ? { enableSms: e.target.checked }
                      : { enableWhatsapp: e.target.checked },
                  )
                }
              />
            </div>
          );
        })}
      </div>

      <div className="max-w-[640px] mt-3 min-h-5 text-[12px]" aria-live="polite">
        {update.isPending ? (
          <span className="text-ink-mute">Saving…</span>
        ) : update.error ? (
          <span className="text-danger">{update.error.message}</span>
        ) : update.isSuccess ? (
          <span className="text-success">Saved ✓</span>
        ) : null}
      </div>

      {!loading && !configured && (
        <div className="max-w-[640px] mt-2 text-[12px] text-ink-soft">
          MSG91 is not configured on the server — set MSG91_AUTH_KEY to enable these toggles.
        </div>
      )}
    </div>
  );
}
