'use client';

import { Button } from '@udyamflow/ui';
import { useEffect, useState } from 'react';
import { useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

function useAppUrl() {
  const [url, setUrl] = useState(process.env.NEXT_PUBLIC_APP_URL ?? '');
  useEffect(() => {
    if (!url) setUrl(window.location.origin);
  }, [url]);
  return url.replace(/\/+$/, '');
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2 items-center">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.target.select()}
        className="flex-1 min-w-0 text-[13px] font-mono bg-surface-mute border border-border rounded-md px-3 py-2 text-ink"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

const STEPS: { app: string; steps: string }[] = [
  {
    app: 'Claude',
    steps: 'Settings → Connectors → Add custom connector → paste the link → Add, then Connect.',
  },
  {
    app: 'ChatGPT',
    steps:
      'Settings → Apps & Connectors → Advanced → turn on Developer mode. Then Create → paste the link, choose OAuth → Create.',
  },
];

export default function AssistantsPage() {
  const utils = trpc.useUtils();
  const appUrl = useAppUrl();
  const { isAdmin } = useActiveRole();
  const mcpUrl = `${appUrl}/api/mcp`;
  const bookUrl = `${appUrl}/api/mcp/book`;
  const connected = trpc.assistants.list.useQuery();
  const disconnect = trpc.assistants.disconnect.useMutation({
    onSuccess: () => utils.assistants.list.invalidate(),
  });
  const settings = trpc.tenant.getSettings.useQuery();
  const update = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => utils.tenant.getSettings.invalidate(),
  });
  const cursorLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=UdyamFlow&config=${
    typeof window === 'undefined' ? '' : btoa(JSON.stringify({ url: mcpUrl }))
  }`;

  return (
    <div className="px-12 py-10 max-w-[900px] mx-auto space-y-6">
      <div>
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · AI assistants
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">AI assistants</h1>
        <p className="text-[13px] text-ink-mute mt-2 max-w-[600px]">
          Run your business by chatting: “What’s my day tomorrow?”, “Book Priya with Dr. Rao on
          Friday at 4”, “Block next Monday for Diwali”. Works with Claude, ChatGPT and other
          assistants that support MCP — no API keys, you just sign in.
        </p>
      </div>

      <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-[15px] font-medium text-ink">Connect your assistant</h2>
        <CopyField value={mcpUrl} label="Connection link" />
        <ol className="space-y-2.5 text-[13px] text-ink">
          {STEPS.map((s) => (
            <li key={s.app}>
              <span className="font-medium">{s.app}:</span>{' '}
              <span className="text-ink-mute">{s.steps}</span>
            </li>
          ))}
          <li>
            <span className="font-medium">Cursor:</span>{' '}
            <a href={cursorLink} className="underline text-ink-mute hover:text-ink">
              Add to Cursor
            </a>
          </li>
          <li>
            <span className="font-medium">Claude Code:</span>{' '}
            <code className="text-[12px] font-mono text-ink-mute">
              claude mcp add --transport http udyamflow {mcpUrl}
            </code>
          </li>
        </ol>
        <p className="text-[12px] text-ink-mute">
          You’ll sign in with your usual email code and choose what the assistant may do. It can’t
          issue refunds, change payment settings or manage your team.
        </p>
      </section>

      <section className="bg-surface border border-border rounded-xl">
        <h2 className="text-[15px] font-medium text-ink px-5 pt-5 pb-3">Connected</h2>
        {connected.isLoading ? (
          <div className="px-5 pb-5 text-[13px] text-ink-mute">Loading…</div>
        ) : connected.error ? (
          <div className="px-5 pb-5 text-[13px] text-danger">{connected.error.message}</div>
        ) : !connected.data?.length ? (
          <div className="px-5 pb-5 text-[13px] text-ink-mute">
            No assistants connected to this workspace yet.
          </div>
        ) : (
          connected.data.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5 border-t border-border"
            >
              <div>
                <div className="text-[14px] font-medium text-ink">{a.name ?? 'Assistant'}</div>
                <div className="text-[12px] text-ink-mute">
                  {a.canMakeChanges ? 'Can view and make changes' : 'View only'} · connected{' '}
                  {a.connectedAt.toLocaleDateString()}
                </div>
              </div>
              <button
                type="button"
                className="text-[12px] text-ink-mute hover:text-danger"
                disabled={disconnect.isPending}
                onClick={() => {
                  if (confirm(`Disconnect ${a.name ?? 'this assistant'}?`)) {
                    disconnect.mutate({ id: a.id });
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          ))
        )}
        {disconnect.error && (
          <div className="px-5 pb-4 text-[12px] text-danger">{disconnect.error.message}</div>
        )}
      </section>

      <section className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-[15px] font-medium text-ink">Bookings from customers’ assistants</h2>
        <p className="text-[13px] text-ink-mute">
          Customers can ask their own assistant to find your business and book a free slot, the same
          as on your booking page. These bookings show “via ai-assistant”.
        </p>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            disabled={!isAdmin || !settings.data || update.isPending}
            checked={settings.data?.assistantBooking ?? true}
            onChange={(e) => update.mutate({ assistantBooking: e.target.checked })}
          />
          Let AI assistants find and book my business
        </label>
        {!isAdmin && (
          <p className="text-[12px] text-ink-mute">Only owners and admins can change this.</p>
        )}
        {update.error && <p className="text-[12px] text-danger">{update.error.message}</p>}
        <div className="pt-1 space-y-1.5">
          <div className="text-[12px] text-ink-mute">Customer booking link for assistants:</div>
          <CopyField value={bookUrl} label="Customer booking link" />
        </div>
      </section>
    </div>
  );
}
