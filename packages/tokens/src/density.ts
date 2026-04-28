export type Density = 'compact' | 'comfortable';

export const DENSITY = {
  compact: { rowH: 32, pad: 10, gap: 8, fontBase: 13 },
  comfortable: { rowH: 40, pad: 14, gap: 12, fontBase: 14 },
} as const satisfies Record<Density, { rowH: number; pad: number; gap: number; fontBase: number }>;
