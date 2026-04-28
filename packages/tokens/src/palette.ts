// Warm-slate neutral palette (Linear/Notion-ish), verbatim from the design canvas.

export const palette = {
  light: {
    bg: '#fbfaf8',
    surface: '#ffffff',
    surfaceMute: '#f5f4f0',
    border: '#e9e7e0',
    borderStrong: '#d6d3ca',
    ink: '#1a1815',
    inkMute: '#5b574e',
    inkSoft: '#8a857a',
    danger: '#c14848',
    success: '#3d7c4d',
  },
  dark: {
    bg: '#141311',
    surface: '#1c1b18',
    surfaceMute: '#252320',
    border: '#2c2a26',
    borderStrong: '#3a3833',
    ink: '#f4f2ec',
    inkMute: '#a8a39a',
    inkSoft: '#7a766d',
    danger: '#e07b7b',
    success: '#7fb78f',
  },
} as const;

export type PaletteMode = keyof typeof palette;
export type PaletteTokens = (typeof palette)[PaletteMode];

// UdyamFlow marketing brand (one warm accent, ink for everything else)
export const UDYAM_BRAND = {
  accent: '#1a1815',
  accentBg: '#fbfaf8',
  highlight: '#c8704a',
} as const;
