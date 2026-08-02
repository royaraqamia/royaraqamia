export function formatGradientAlpha(colorStr: string, alpha: number): string {
  if (colorStr.startsWith('rgba')) {
    return colorStr.replace(/,\s*[\d.]+\)/, `, ${alpha})`);
  }
  if (colorStr.startsWith('rgb(')) {
    return colorStr.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  if (colorStr.startsWith('#')) {
    const hexAlpha = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0');
    return `${colorStr}${hexAlpha}`;
  }
  return colorStr;
}
