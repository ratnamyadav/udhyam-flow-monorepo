'use client';

import { deriveAccentPalette, type FontId, fontIdFrom, isHexColor } from '@udyamflow/tokens';
import { Button, Input, Label } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useActiveTheme } from '@/components/app-shell/app-shell';
import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import { BookingPreview, initials, LogoBadge } from '@/components/theme/booking-preview';
import {
  ColorField,
  FontPicker,
  type Palette,
  PaletteWarnings,
  PresetSwatches,
  paletteFromAccent,
} from '@/components/theme/brand-controls';
import {
  BOOKING_LAYOUTS,
  type BookingLayout,
  defaultHeadline,
  defaultIntro,
  HEADLINE_MAX,
  INTRO_MAX,
  isBookingLayout,
  professionFor,
} from '@/lib/booking-copy';
import { trpc } from '@/lib/trpc/react';

// Must agree with the presign route's cap (app/api/upload/logo/presign).
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const RADIUS_MAX = 24;
const RADIUS_STOPS = [
  { label: 'Sharp', value: 0 },
  { label: 'Soft', value: 8 },
  { label: 'Round', value: 16 },
];

type Density = 'compact' | 'comfortable';

const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: 'compact', label: 'Compact', hint: 'Tighter slots and cards — more fits on screen.' },
  { id: 'comfortable', label: 'Comfortable', hint: 'Roomier, easier to tap.' },
];

const LAYOUT_INFO: Record<BookingLayout, { label: string; hint: string }> = {
  sidebar: { label: 'Sidebar', hint: 'Business and team on the left, times on the right.' },
  stacked: { label: 'Stacked', hint: 'A branded header card with everything below it.' },
  inline: { label: 'Week view', hint: 'Several days side by side — good for busy calendars.' },
};

// Everything the Save button persists. The logo image is saved on upload.
type Draft = Palette & {
  logoText: string;
  radius: number;
  density: Density;
  fontDisplay: FontId;
  fontUi: FontId;
  bookingLayout: BookingLayout;
  bookingHeadline: string;
  bookingIntro: string;
};

const DEFAULT_DRAFT: Draft = {
  logoText: '',
  accent: '#0f766e',
  accentSoft: '#ccfbf1',
  accentInk: '#134e4a',
  radius: 8,
  density: 'comfortable',
  fontDisplay: 'inter',
  fontUi: 'inter',
  bookingLayout: 'sidebar',
  bookingHeadline: '',
  bookingIntro: '',
};

type SettingsShape = {
  logoText: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  radius: number;
  density: string;
  fontDisplay: string;
  fontUi: string;
  bookingLayout?: string | null;
  bookingHeadline?: string | null;
  bookingIntro?: string | null;
};

function draftFromSettings(s: SettingsShape): Draft {
  return {
    logoText: s.logoText,
    accent: s.accent,
    accentSoft: s.accentSoft,
    accentInk: s.accentInk,
    radius: s.radius,
    density: s.density === 'compact' ? 'compact' : 'comfortable',
    fontDisplay: fontIdFrom(s.fontDisplay),
    fontUi: fontIdFrom(s.fontUi),
    bookingLayout: isBookingLayout(s.bookingLayout) ? s.bookingLayout : 'sidebar',
    bookingHeadline: s.bookingHeadline ?? '',
    bookingIntro: s.bookingIntro ?? '',
  };
}

function sameDraft(a: Draft, b: Draft) {
  return (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k]);
}

export default function BrandingSettingsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const activeTheme = useActiveTheme();
  const settingsQuery = trpc.tenant.getSettings.useQuery();
  const locationsQuery = trpc.location.list.useQuery();
  const resourcesQuery = trpc.resource.list.useQuery();
  const onSaved = () => {
    utils.tenant.getSettings.invalidate();
    router.refresh(); // re-renders the (app) layout so the topbar/theme update
  };
  const updateSettings = trpc.tenant.updateSettings.useMutation({ onSuccess: onSaved });
  // Logo upload/remove save immediately and independently of the draft.
  const updateLogo = trpc.tenant.updateSettings.useMutation({ onSuccess: onSaved });

  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  // Last saved (or loaded) values; null until settings arrive.
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');

  const dirty = baseline !== null && !sameDraft(draft, baseline);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Hydrate from the server — but never over unsaved edits. getSettings is
  // refetched after logo uploads (and by other pages' mutations); without the
  // dirty guard every refetch silently wiped whatever the user was typing.
  useEffect(() => {
    const data = settingsQuery.data;
    if (data === undefined || dirtyRef.current) return;
    const next = data ? draftFromSettings(data) : DEFAULT_DRAFT;
    setDraft(next);
    setBaseline(next);
    setLogoUrl(data?.logoUrl ?? null);
  }, [settingsQuery.data]);

  // Warn before losing unsaved edits: tab close/reload, and in-app links
  // (Next's client-side navigation never fires beforeunload).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved branding changes. Leave without saving?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setJustSaved(false);
  }
  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
    setJustSaved(false);
  }

  const orgName = activeTheme?.name ?? 'Your business';
  const slug = activeTheme?.slug ?? null;
  const profession = professionFor(settingsQuery.data?.profession ?? activeTheme?.profession);
  const firstLocation = locationsQuery.data?.[0] ?? null;
  const firstResource =
    resourcesQuery.data?.find((r) => !firstLocation || r.locationId === firstLocation.id) ??
    resourcesQuery.data?.[0] ??
    null;
  const headlinePlaceholder = defaultHeadline(profession, firstResource?.name);
  const introPlaceholder = defaultIntro(profession, firstResource?.title);

  const paletteValid = [draft.accent, draft.accentSoft, draft.accentInk].every(isHexColor);
  const derived = isHexColor(draft.accent) ? deriveAccentPalette(draft.accent) : null;
  const usingDerived =
    !!derived && derived.accentSoft === draft.accentSoft && derived.accentInk === draft.accentInk;

  async function onUploadLogo(rawFile: File) {
    setUploadError(null);
    if (!LOGO_TYPES.includes(rawFile.type)) {
      setUploadError('Use a PNG, JPG or WebP image.');
      return;
    }
    setUploading(true);
    try {
      // Client-side resize first — keeps storage + CDN egress tiny.
      const { resizeImageForUpload } = await import('@/lib/resize-image');
      const file = await resizeImageForUpload(rawFile);
      if (file.size > MAX_LOGO_BYTES) throw new Error('Image is larger than 2 MB after resizing.');

      // Step 1: ask the server for a presigned PUT URL.
      const presignRes = await fetch('/api/upload/logo/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      const presign = (await presignRes.json()) as {
        uploadUrl?: string;
        publicUrl?: string;
        headers?: Record<string, string>;
        error?: string;
      };
      if (!presignRes.ok || !presign.uploadUrl || !presign.publicUrl) {
        throw new Error(presign.error ?? 'Could not prepare upload');
      }

      // Step 2: upload directly to object storage.
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: presign.headers,
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

      // Step 3: persist the public URL on the tenant.
      setLogoUrl(presign.publicUrl);
      await updateLogo.mutateAsync({ logoUrl: presign.publicUrl });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveLogo() {
    setUploadError(null);
    const previous = logoUrl;
    setLogoUrl(null);
    try {
      await updateLogo.mutateAsync({ logoUrl: null });
    } catch (e) {
      setLogoUrl(previous);
      setUploadError(e instanceof Error ? e.message : 'Could not remove logo');
    }
  }

  async function onSave() {
    setFormError(null);
    if (!paletteValid) {
      setFormError('Fix the highlighted color — colors must be hex values like #0f766e.');
      return;
    }
    const snapshot = draft;
    try {
      await updateSettings.mutateAsync({
        logoText: snapshot.logoText.trim() || initials(orgName),
        accent: snapshot.accent,
        accentSoft: snapshot.accentSoft,
        accentInk: snapshot.accentInk,
        radius: snapshot.radius,
        density: snapshot.density,
        fontDisplay: snapshot.fontDisplay,
        fontUi: snapshot.fontUi,
        bookingLayout: snapshot.bookingLayout,
        bookingHeadline: snapshot.bookingHeadline.trim() || null,
        bookingIntro: snapshot.bookingIntro.trim() || null,
      });
    } catch {
      // Shown via updateSettings.error below.
      return;
    }
    setBaseline(snapshot);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  function onDiscard() {
    if (!baseline) return;
    setDraft(baseline);
    setFormError(null);
    updateSettings.reset();
  }

  const loading = settingsQuery.isLoading;

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Settings · Branding
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">Brand customization</h1>
          <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
            Your logo, colors, fonts and booking-page wording. Changes preview live on the right and
            go out to customers when you save.
          </p>
        </div>
      </div>

      {!isAdmin && <MemberNote what="change branding" />}
      {settingsQuery.error && (
        <div className="mb-6 text-[13px] text-danger">
          Couldn't load your branding settings: {settingsQuery.error.message}
        </div>
      )}

      <div className="grid grid-cols-[440px_1fr] gap-10 items-start">
        {/* The fieldset disables every control for members, who can't save. */}
        <fieldset disabled={!isAdmin || loading} className="min-w-0">
          <legend className="sr-only">Brand settings</legend>
          <div className="space-y-9">
            <Section title="Logo" id="logo">
              {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone is a mouse shortcut; the Upload button below is the accessible path */}
              <div
                onDragOver={(e) => {
                  if (!isAdmin || uploading) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!isAdmin || uploading) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) onUploadLogo(file);
                }}
                className="flex items-center gap-4 p-3 rounded-lg border border-dashed transition-colors"
                style={{
                  borderColor: dragOver ? 'var(--color-ink)' : 'var(--color-border-strong)',
                  background: dragOver ? 'var(--color-surface-mute)' : 'var(--color-surface)',
                }}
              >
                <LogoBadge
                  size={56}
                  logoUrl={logoUrl}
                  text={draft.logoText || initials(orgName)}
                  accent={isHexColor(draft.accent) ? draft.accent : '#1a1815'}
                  radius={draft.radius}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-[12px] px-3 py-1.5 rounded-md border border-border bg-surface text-ink cursor-pointer hover:bg-surface-mute has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
                      {uploading ? 'Uploading…' : logoUrl ? 'Replace image' : 'Upload image'}
                      <input
                        type="file"
                        accept={LOGO_TYPES.join(',')}
                        disabled={uploading}
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUploadLogo(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        className="text-[12px] text-ink-mute hover:text-danger disabled:opacity-50"
                        onClick={onRemoveLogo}
                        disabled={uploading || updateLogo.isPending}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-ink-soft">
                    Or drop an image here. PNG, JPG or WebP, max 2 MB — square works best. Saved as
                    soon as it uploads.
                  </div>
                </div>
              </div>
              {uploadError && (
                <div role="alert" className="text-[12px] text-danger">
                  {uploadError}
                </div>
              )}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="logo-text">Fallback text</Label>
                <Input
                  id="logo-text"
                  maxLength={4}
                  value={draft.logoText}
                  onChange={(e) => set('logoText', e.target.value.toUpperCase())}
                  placeholder={initials(orgName)}
                  aria-describedby="logo-text-help"
                />
                <div id="logo-text-help" className="text-[11px] text-ink-soft">
                  2–4 characters shown in a colored badge{' '}
                  {logoUrl ? 'if the image ever fails to load.' : 'until you upload an image.'}
                </div>
              </div>
            </Section>

            <Section title="Colors" id="colors">
              <PresetSwatches
                accent={draft.accent}
                onPick={(p) =>
                  patch({ accent: p.accent, accentSoft: p.accentSoft, accentInk: p.accentInk })
                }
              />
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="accent">Custom accent</Label>
                <ColorField
                  id="accent"
                  label="Accent"
                  value={draft.accent}
                  onChange={(hex) => patch(paletteFromAccent(hex))}
                />
                <div className="text-[11px] text-ink-soft">
                  Buttons, selected times and highlights. A matching tint and text shade are derived
                  automatically.
                </div>
              </div>
              <details className="group rounded-md border border-border bg-surface px-3 py-2">
                <summary className="cursor-pointer text-[12px] text-ink select-none list-none flex items-center justify-between">
                  <span>Advanced: tint &amp; text shade</span>
                  <span className="text-ink-soft text-[11px]">
                    {usingDerived ? 'Auto' : 'Custom'}{' '}
                    <span
                      aria-hidden
                      className="inline-block transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                  </span>
                </summary>
                <div className="mt-3 space-y-3 pb-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="accent-soft">Tint (backgrounds)</Label>
                    <ColorField
                      id="accent-soft"
                      label="Tint"
                      value={draft.accentSoft}
                      onChange={(hex) => set('accentSoft', hex)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="accent-ink">Text shade (text on the tint)</Label>
                    <ColorField
                      id="accent-ink"
                      label="Text shade"
                      value={draft.accentInk}
                      onChange={(hex) => set('accentInk', hex)}
                    />
                  </div>
                  {derived && !usingDerived && (
                    <button
                      type="button"
                      className="text-[12px] text-ink-mute underline underline-offset-2 hover:text-ink"
                      onClick={() => patch(derived)}
                    >
                      Reset to colors derived from the accent
                    </button>
                  )}
                </div>
              </details>
              <PaletteWarnings palette={draft} />
            </Section>

            <Section title="Fonts" id="fonts">
              <div className="space-y-2">
                <div className="text-[12px] text-ink">Headings</div>
                <FontPicker
                  label="Heading font"
                  value={draft.fontDisplay}
                  onChange={(id) => set('fontDisplay', id)}
                />
              </div>
              <div className="space-y-2 pt-2">
                <div className="text-[12px] text-ink">Body text</div>
                <FontPicker
                  label="Body text font"
                  value={draft.fontUi}
                  onChange={(id) => set('fontUi', id)}
                />
              </div>
            </Section>

            <Section title="Shape & spacing" id="shape">
              <div className="space-y-1.5">
                <Label htmlFor="radius">Corner radius</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="radius"
                    type="range"
                    min={0}
                    max={RADIUS_MAX}
                    value={draft.radius}
                    aria-valuetext={`${draft.radius} pixels`}
                    onChange={(e) => set('radius', Number(e.target.value))}
                    className="flex-1 accent-ink"
                  />
                  <span className="text-[13px] font-mono text-ink-mute w-10 tabular-nums text-right">
                    {draft.radius}px
                  </span>
                </div>
                <fieldset aria-label="Radius presets" className="min-w-0 flex gap-1.5">
                  {RADIUS_STOPS.map((r) => (
                    <ChoiceButton
                      key={r.value}
                      on={draft.radius === r.value}
                      onClick={() => set('radius', r.value)}
                      ariaLabel={`${r.label} corners (${r.value}px)`}
                    >
                      <span
                        aria-hidden
                        className="inline-block w-3 h-3 border-t-2 border-l-2 border-ink-mute mr-1.5 align-[-1px]"
                        style={{ borderTopLeftRadius: r.value / 2 }}
                      />
                      {r.label}
                    </ChoiceButton>
                  ))}
                </fieldset>
              </div>
              <div className="space-y-1.5 pt-2">
                <div className="text-[12px] text-ink">Density</div>
                <fieldset aria-label="Density" className="min-w-0 grid grid-cols-2 gap-2">
                  {DENSITIES.map((d) => (
                    <ChoiceButton
                      key={d.id}
                      on={draft.density === d.id}
                      onClick={() => set('density', d.id)}
                      block
                    >
                      <div className="text-[12px] font-medium text-ink">{d.label}</div>
                      <div className="text-[11px] text-ink-mute font-normal mt-0.5">{d.hint}</div>
                    </ChoiceButton>
                  ))}
                </fieldset>
              </div>
            </Section>

            <Section title="Booking page" id="booking-page">
              <div className="space-y-1.5">
                <div className="text-[12px] text-ink">Default layout</div>
                <fieldset aria-label="Default layout" className="min-w-0 grid grid-cols-3 gap-2">
                  {BOOKING_LAYOUTS.map((l) => (
                    <ChoiceButton
                      key={l}
                      on={draft.bookingLayout === l}
                      onClick={() => set('bookingLayout', l)}
                      block
                    >
                      <LayoutSchematic layout={l} />
                      <div className="text-[12px] font-medium text-ink mt-2">
                        {LAYOUT_INFO[l].label}
                      </div>
                      <div className="text-[11px] text-ink-mute font-normal mt-0.5 leading-snug">
                        {LAYOUT_INFO[l].hint}
                      </div>
                    </ChoiceButton>
                  ))}
                </fieldset>
              </div>
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between items-baseline">
                  <Label htmlFor="booking-headline">Headline</Label>
                  <Counter value={draft.bookingHeadline} max={HEADLINE_MAX} />
                </div>
                <Input
                  id="booking-headline"
                  maxLength={HEADLINE_MAX}
                  value={draft.bookingHeadline}
                  onChange={(e) => set('bookingHeadline', e.target.value)}
                  placeholder={headlinePlaceholder}
                  aria-describedby="booking-copy-help"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <Label htmlFor="booking-intro">Intro</Label>
                  <Counter value={draft.bookingIntro} max={INTRO_MAX} />
                </div>
                <textarea
                  id="booking-intro"
                  maxLength={INTRO_MAX}
                  rows={4}
                  value={draft.bookingIntro}
                  onChange={(e) => set('bookingIntro', e.target.value)}
                  placeholder={introPlaceholder}
                  aria-describedby="booking-copy-help"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink leading-relaxed placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-mute disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                />
                <div id="booking-copy-help" className="text-[11px] text-ink-soft">
                  Leave blank to use the default wording. Plain text; line breaks are kept.
                </div>
              </div>
            </Section>

            {/* Sticky save bar */}
            <div className="sticky bottom-0 z-10 -mx-3 px-3 py-3 bg-bg/95 backdrop-blur border-t border-border">
              {isAdmin ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-[12px]" aria-live="polite">
                    {updateSettings.isPending ? (
                      <span className="text-ink-mute">Saving…</span>
                    ) : dirty ? (
                      <span className="text-ink font-medium">
                        <span
                          aria-hidden
                          className="inline-block w-1.5 h-1.5 rounded-full bg-highlight mr-1.5 align-middle"
                        />
                        Unsaved changes
                      </span>
                    ) : justSaved ? (
                      <span className="text-success">Saved ✓</span>
                    ) : (
                      <span className="text-ink-soft">All changes saved</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDiscard}
                    disabled={!dirty || updateSettings.isPending}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={onSave}
                    disabled={!dirty || !paletteValid || updateSettings.isPending}
                  >
                    {updateSettings.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              ) : (
                <div className="text-[12px] text-ink-soft">
                  Only owners and admins can change branding.
                </div>
              )}
              {(formError || updateSettings.error) && (
                <div role="alert" className="mt-2 text-[12px] text-danger">
                  {formError ?? updateSettings.error?.message}
                </div>
              )}
              {!paletteValid && !formError && (
                <div className="mt-2 text-[12px] text-danger">
                  Fix the highlighted color to save.
                </div>
              )}
            </div>
          </div>
        </fieldset>

        <div className="sticky top-6">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono">
              Live preview · {LAYOUT_INFO[draft.bookingLayout].label.toLowerCase()} ·{' '}
              {draft.density}
            </div>
            <div className="flex items-center gap-3">
              <fieldset
                aria-label="Preview width"
                className="min-w-0 flex p-0.5 rounded-md border border-border bg-surface"
              >
                {(['desktop', 'mobile'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={previewWidth === w}
                    onClick={() => setPreviewWidth(w)}
                    className="px-2.5 py-1 text-[12px] rounded capitalize focus-visible:outline-2 focus-visible:outline-ink"
                    style={{
                      background: previewWidth === w ? 'var(--color-surface-mute)' : 'transparent',
                      color: previewWidth === w ? 'var(--color-ink)' : 'var(--color-ink-mute)',
                      fontWeight: previewWidth === w ? 500 : 400,
                    }}
                  >
                    {w}
                  </button>
                ))}
              </fieldset>
              {slug && (
                <a
                  href={`/book/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-ink hover:underline underline-offset-2 whitespace-nowrap"
                  title={dirty ? 'Shows your saved settings — save first to see these edits.' : ''}
                >
                  Open booking page ↗<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
          <BookingPreview
            draft={draft}
            fallback={baseline ?? DEFAULT_DRAFT}
            logoUrl={logoUrl}
            orgName={orgName}
            locationName={firstLocation?.name ?? null}
            resources={(resourcesQuery.data ?? []).slice(0, 3).map((r) => ({
              name: r.name,
              title: r.title,
            }))}
            headline={draft.bookingHeadline.trim() || headlinePlaceholder}
            intro={draft.bookingIntro.trim() || introPlaceholder}
            customHeadline={!!draft.bookingHeadline.trim()}
            customIntro={!!draft.bookingIntro.trim()}
            profession={profession}
            mobile={previewWidth === 'mobile'}
          />
          {dirty && slug && (
            <div className="mt-2 text-[11px] text-ink-soft">
              The public booking page shows your saved settings — save to publish these edits.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`section-${id}`} className="space-y-3">
      <h2
        id={`section-${id}`}
        className="text-xs font-medium text-ink-mute uppercase tracking-wider"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChoiceButton({
  on,
  onClick,
  children,
  ariaLabel,
  block = false,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`rounded-md border text-left text-[12px] text-ink transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:hover:border-border ${
        block ? 'px-3 py-2.5' : 'px-2.5 py-1'
      }`}
      style={{
        borderColor: on ? 'var(--color-ink)' : 'var(--color-border)',
        background: on ? 'var(--color-surface-mute)' : 'var(--color-surface)',
        boxShadow: on ? '0 0 0 1px var(--color-ink)' : undefined,
      }}
    >
      {children}
    </button>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return (
    <span
      className="text-[11px] font-mono tabular-nums"
      style={{ color: n >= max ? 'var(--color-danger)' : 'var(--color-ink-soft)' }}
    >
      {n}/{max}
    </span>
  );
}

function LayoutSchematic({ layout }: { layout: BookingLayout }) {
  const bar = 'bg-border-strong rounded-[2px]';
  return (
    <div aria-hidden className="h-10 w-full rounded border border-border bg-bg p-1 flex gap-1">
      {layout === 'sidebar' && (
        <>
          <div className="w-1/3 bg-surface-mute rounded-[2px] p-0.5 space-y-0.5">
            <div className={`${bar} h-1 w-3/4`} />
            <div className={`${bar} h-1 w-1/2`} />
          </div>
          <div className="flex-1 grid grid-cols-3 gap-0.5 content-start pt-0.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`${bar} h-1.5`} />
            ))}
          </div>
        </>
      )}
      {layout === 'stacked' && (
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="h-3 bg-surface-mute rounded-[2px]" />
          <div className="grid grid-cols-4 gap-0.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${bar} h-1.5`} />
            ))}
          </div>
        </div>
      )}
      {layout === 'inline' &&
        [0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 flex flex-col gap-0.5">
            <div className="h-1 bg-ink-soft rounded-[2px] w-2/3" />
            <div className={`${bar} h-1.5`} />
            <div className={`${bar} h-1.5`} />
          </div>
        ))}
    </div>
  );
}
