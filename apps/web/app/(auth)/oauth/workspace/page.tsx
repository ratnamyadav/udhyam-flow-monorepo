'use client';
import { authClient, useListOrganizations } from '@udyamflow/auth/client';
import { useState } from 'react';

// For people in several workspaces: which one the assistant should get.
// Continuing hands the signed OAuth query (from this URL) back to the
// authorize flow, which moves on to the consent page.
export default function PickWorkspacePage() {
  const orgs = useListOrganizations();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(organizationId: string) {
    setBusy(organizationId);
    setError(null);
    const active = await authClient.organization.setActive({ organizationId });
    const res = active.error ? active : await authClient.oauth2.continue({ postLogin: true });
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong. Try connecting again.');
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <h1 className="text-[28px] font-medium tracking-tight text-ink mb-2">Pick a workspace</h1>
      <p className="text-sm text-ink-mute mb-6">
        Which business should your assistant work with? You can connect another one later.
      </p>
      <div className="space-y-2">
        {orgs.isPending && <p className="text-sm text-ink-mute">Loading…</p>}
        {orgs.data?.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={!!busy}
            onClick={() => pick(o.id)}
            className="w-full text-left px-4 py-3 rounded-lg border border-border bg-surface hover:bg-surface-mute disabled:opacity-60"
          >
            <div className="text-[14px] font-medium text-ink">{o.name}</div>
            {busy === o.id && <div className="text-[12px] text-ink-mute">Continuing…</div>}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-danger mt-3">{error}</p>}
    </div>
  );
}
