const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
export const usdCompact = (n) => (Number.isFinite(n) ? '$' + compact.format(n) : '—');
export function usdPrice(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (n === 0) return '$0';
  const dp = Math.min(10, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return '$' + n.toFixed(dp);
}
export const pct = (n) => (Number.isFinite(n) ? (n > 0 ? '▲ ' : n < 0 ? '▼ ' : '') + Math.abs(n).toFixed(2) + '%' : '—');
