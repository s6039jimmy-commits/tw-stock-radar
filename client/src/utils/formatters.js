export const formatPrice = (price) => {
  if (price === null || price === undefined) return '-';
  return `NT$ ${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatPercent = (pct) => {
  if (pct === null || pct === undefined) return '-';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${Number(pct).toFixed(2)}%`;
};

export const formatVolume = (vol) => {
  if (vol === null || vol === undefined) return '-';
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol.toString();
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const formatTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

export const getStarEmojis = (count) => {
  const max = 5;
  const rating = Math.min(Math.max(0, count || 0), max);
  return '⭐'.repeat(rating);
};

export const getProfitClass = (val) => {
  if (val > 0) return 'text-up';
  if (val < 0) return 'text-down';
  return 'text-neutral';
};
