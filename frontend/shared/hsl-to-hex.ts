export function hslToHex(hsl: string): string | null {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const [hue, sat, lig] = parts;
  if (hue === undefined || sat === undefined || lig === undefined) return null;

  const h = ((parseFloat(hue) % 360) + 360) % 360;
  const s = Math.min(Math.max(parseFloat(sat) / 100, 0), 1);
  const l = Math.min(Math.max(parseFloat(lig) / 100, 0), 1);
  if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)) return null;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
