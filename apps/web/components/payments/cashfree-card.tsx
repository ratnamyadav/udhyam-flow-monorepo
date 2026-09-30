'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useEffect, useState } from 'react';
import { useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

// Must match REDACTED_SECRET in packages/api — tenant.getSettings returns this
// in place of the saved (encrypted) Cashfree secret.
const REDACTED = '••••••';

// Cashfree (INR) card. Tenants can save their own Cashfree App ID + Secret so
// payments settle to their account; otherwise checkout falls back to the
// platform's Cashfree account (when the server has one configured).
export function CashfreeCard({
  platformReady,
  missing,
}: {
  platformReady: boolean;
  missing: string[];
}) {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const settings = trpc.tenant.getSettings.useQuery();
  const update = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => utils.tenant.getSettings.invalidate(),
  });

  const savedAppId = settings.data?.cashfreeMerchantId ?? '';
  const secretSaved = settings.data?.cashfreeApiKey === REDACTED;
  const tenantConfigured = !!savedAppId && secretSaved;

  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAppId(savedAppId);
  }, [savedAppId]);

  let badge: { label: string; good: boolean } = { label: 'Not configured', good: false };
  if (tenantConfigured) badge = { label: 'Your account', good: true };
  else if (platformReady) badge = { label: 'Platform account', good: true };

  async function save() {
    setError(null);
    setSaved(false);
    const id = appId.trim();
    if (!id) {
      setError('Enter your Cashfree App ID.');
      return;
    }
    if (!secretSaved && !secret.trim()) {
      setError('Enter your Cashfree Secret Key.');
      return;
    }
    try {
      await update.mutateAsync({
        cashfreeMerchantId: id,
        // Blank = keep the saved secret. The server ignores the sentinel too.
        cashfreeApiKey: secret.trim() ? secret.trim() : REDACTED,
      });
      setSecret('');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save Cashfree credentials');
    }
  }

  async function clear() {
    if (!confirm('Remove your Cashfree credentials? INR payments will use the platform account.'))
      return;
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({ cashfreeMerchantId: null, cashfreeApiKey: null });
      setAppId('');
      setSecret('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove Cashfree credentials');
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[15px] font-medium text-ink">Cashfree</div>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: badge.good ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
            color: badge.good ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
          }}
        >
          {badge.label}
        </span>
      </div>
      <div className="text-[12px] text-ink-mute">India · INR</div>

      <div className="mt-3 text-[12px] text-ink-mute leading-relaxed">
        {tenantConfigured
          ? 'INR payments settle directly to your own Cashfree account.'
          : platformReady
            ? "INR payments currently settle to the platform's Cashfree account. Add your own credentials to get paid directly."
            : 'Add your Cashfree credentials to accept INR payments.'}
      </div>

      {!platformReady && missing.length > 0 && !tenantConfigured && (
        <div className="mt-2 text-[11px] text-ink-soft">
          Platform fallback not configured (
          {missing.map((m, i) => (
            <span key={m} className="font-mono">
              {i > 0 ? ', ' : ''}
              {m}
            </span>
          ))}
          ).
        </div>
      )}

      {settings.error ? (
        <div className="mt-3 text-[12px] text-danger">{settings.error.message}</div>
      ) : isAdmin ? (
        <div className="mt-4 space-y-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="cf-app-id">App ID</Label>
            <Input
              id="cf-app-id"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g. 12345abcde"
              autoComplete="off"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-secret">Secret key</Label>
            <Input
              id="cf-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={secretSaved ? `${REDACTED} Saved — leave blank to keep` : 'cfsk_…'}
              autoComplete="new-password"
              className="font-mono"
            />
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
          {saved && <div className="text-[12px] text-success">Saved.</div>}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save credentials'}
            </Button>
            {(savedAppId || secretSaved) && (
              <button
                type="button"
                className="text-[12px] text-ink-mute hover:text-danger"
                onClick={clear}
                disabled={update.isPending}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[12px] text-ink-soft">
          Only owners and admins can change payment credentials.
        </div>
      )}

      <a
        href="https://docs.cashfree.com/docs/pg-new"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-[12px] text-ink-mute hover:text-ink underline-offset-2 hover:underline"
      >
        Setup docs →
      </a>
    </div>
  );
}
