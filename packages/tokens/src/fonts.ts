// Fonts a tenant can choose for their booking page. Settings store the font
// `id`; `fontStack()` turns it into a CSS font-family. The web app loads each
// font with next/font, which registers it under a hashed family name exposed
// only through the CSS variable below — a literal `"Fraunces"` stack would
// silently fall back to Georgia.

export type FontId =
  | 'inter'
  | 'dm-sans'
  | 'nunito'
  | 'space-grotesk'
  | 'fraunces'
  | 'playfair'
  | 'lora';

export type FontOption = {
  id: FontId;
  label: string;
  category: 'sans' | 'serif';
  // CSS variable set by next/font in apps/web/app/layout.tsx.
  cssVar: string;
  fallback: string;
  // Shown in the picker.
  vibe: string;
};

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    category: 'sans',
    cssVar: '--font-inter',
    fallback: 'system-ui, sans-serif',
    vibe: 'Clean, neutral',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'sans',
    cssVar: '--font-dm-sans',
    fallback: 'system-ui, sans-serif',
    vibe: 'Friendly, modern',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    category: 'sans',
    cssVar: '--font-nunito',
    fallback: 'system-ui, sans-serif',
    vibe: 'Soft, rounded',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    category: 'sans',
    cssVar: '--font-space-grotesk',
    fallback: 'system-ui, sans-serif',
    vibe: 'Bold, sporty',
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    category: 'serif',
    cssVar: '--font-fraunces',
    fallback: 'Georgia, serif',
    vibe: 'Warm, editorial',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    category: 'serif',
    cssVar: '--font-playfair',
    fallback: 'Georgia, serif',
    vibe: 'Elegant, high-contrast',
  },
  {
    id: 'lora',
    label: 'Lora',
    category: 'serif',
    cssVar: '--font-lora',
    fallback: 'Georgia, serif',
    vibe: 'Classic, calm',
  },
];

export const FONT_IDS = FONT_OPTIONS.map((f) => f.id) as [FontId, ...FontId[]];

const byId = new Map(FONT_OPTIONS.map((f) => [f.id, f]));

// Maps a stored value to a font id. Rows written before font ids existed
// hold a literal stack like `"Fraunces", Georgia, serif`.
export function fontIdFrom(value: string | null | undefined): FontId {
  if (!value) return 'inter';
  if (byId.has(value as FontId)) return value as FontId;
  const lower = value.toLowerCase();
  const match = FONT_OPTIONS.find((f) => lower.includes(f.label.toLowerCase()));
  return match?.id ?? 'inter';
}

export function fontStack(value: string | null | undefined): string {
  const f = byId.get(fontIdFrom(value))!;
  return `var(${f.cssVar}), ${f.fallback}`;
}
