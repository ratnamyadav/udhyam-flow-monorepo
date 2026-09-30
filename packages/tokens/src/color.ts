// Color math for tenant theming: derive a full accent palette from one
// color, pick readable text for it, and flag low-contrast choices.
// Pure functions, no dependencies — used by web, mobile and the API.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// Linear blend: t=0 → a, t=1 → b.
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

// WCAG 2.x relative luminance.
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';
const INK = '#1a1815';

// Text color for content sitting on `bg` (buttons, selected slots, logo
// badges): white or ink, whichever reads better.
export function readableTextOn(bg: string): string {
  if (!isHexColor(bg)) return WHITE;
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? WHITE : INK;
}

// A tinted background and a dark text shade that belong with `accent`, so
// picking one custom color gives a coherent palette.
export function deriveAccentPalette(accent: string): { accentSoft: string; accentInk: string } {
  if (!isHexColor(accent)) return { accentSoft: '#f5f4f0', accentInk: INK };
  return {
    accentSoft: mixHex(accent, WHITE, 0.86),
    accentInk: mixHex(accent, '#000000', 0.55),
  };
}

export type ColorWarning = { level: 'error' | 'warning'; message: string };

// Accessibility checks for a tenant palette (WCAG AA: 4.5:1 for text, 3:1
// for large text / UI components).
export function paletteWarnings(p: {
  accent: string;
  accentSoft: string;
  accentInk: string;
}): ColorWarning[] {
  const out: ColorWarning[] = [];
  if (![p.accent, p.accentSoft, p.accentInk].every(isHexColor)) {
    return [{ level: 'error', message: 'Colors must be 6-digit hex values like #0f766e.' }];
  }
  const onAccent = readableTextOn(p.accent);
  if (contrastRatio(p.accent, onAccent) < 4.5) {
    out.push({
      level: 'warning',
      message: 'Button text on this accent is hard to read. Try a darker or more saturated color.',
    });
  }
  if (contrastRatio(p.accent, WHITE) < 3 && contrastRatio(p.accent, '#fbfaf8') < 3) {
    out.push({
      level: 'warning',
      message: 'The accent is very light — selected slots and borders may be hard to see.',
    });
  }
  if (contrastRatio(p.accentInk, p.accentSoft) < 4.5) {
    out.push({
      level: 'warning',
      message: 'Text on the tinted background is low-contrast. Use a darker ink shade.',
    });
  }
  return out;
}
