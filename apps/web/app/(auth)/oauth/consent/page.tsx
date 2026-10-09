'use client';
import { authClient } from '@udyamflow/auth/client';
import { Button } from '@udyamflow/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

// OAuth consent for AI assistants (MCP clients). Reached from
// /api/auth/oauth2/authorize with a signed query; the auth client sends that
// query back with the decision and follows the redirect to the assistant.
export default function ConsentPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Consent />
    </Suspense>
  );
}

function Consent() {
  const params = useSearchParams();
  const clientId = params.get('client_id') ?? '';
  const requested = (params.get('scope') ?? '').split(' ').filter(Boolean);
  const wantsWrite = requested.includes('workspace:write');
  const [clientName, setClientName] = useState<string | null>(null);
  const [allowChanges, setAllowChanges] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspace = authClient.useActiveOrganization();

  useEffect(() => {
    if (!clientId) return;
    authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then((res) => setClientName(res.data?.client_name ?? null))
      .catch(() => setClientName(null));
  }, [clientId]);

  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    const scope = requested.filter((s) => allowChanges || s !== 'workspace:write').join(' ');
    const res = await authClient.oauth2.consent(accept ? { accept, scope } : { accept });
    // On success the auth client navigates to the assistant.
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong. Try connecting again.');
      setBusy(false);
    }
  }

  const name = clientName ?? 'An AI assistant';
  return (
    <div className="w-full max-w-[420px]">
      <h1 className="text-[28px] font-medium tracking-tight text-ink mb-2">
        Connect {name} to UdyamFlow?
      </h1>
      <p className="text-sm text-ink-mute mb-6">
        {name} will work in{' '}
        <strong className="text-ink">{workspace.data?.name ?? 'your workspace'}</strong> as you.
      </p>
      <ul className="text-sm text-ink space-y-2 mb-5">
        <li>✓ See your bookings, schedule, customers, staff and reports</li>
        {wantsWrite && (
          <li>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={allowChanges}
                onChange={(e) => setAllowChanges(e.target.checked)}
              />
              <span>
                Also book, move and cancel appointments, block time off and add customer notes
              </span>
            </label>
          </li>
        )}
      </ul>
      <p className="text-xs text-ink-mute mb-6">
        It can't issue refunds, change payment settings or manage your team. You can disconnect it
        any time in Settings → AI assistants.
      </p>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="flex gap-3">
        <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
          {busy ? 'Connecting…' : 'Allow'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
