export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

/**
 * Accent tint with a two-hex-digit alpha (e.g. '10' ≈ 6%). Appending the alpha
 * only works for `#rrggbb`; anything else (named colors, `#rgb`, `oklch(…)`)
 * falls back to `color-mix`, which accepts any CSS color.
 */
export function withAlpha(color: string, alphaHex: string): string {
  if (isHexColor(color)) return `${color}${alphaHex}`;
  const pct = Math.round((Number.parseInt(alphaHex, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${Number.isFinite(pct) ? pct : 10}%, transparent)`;
}
