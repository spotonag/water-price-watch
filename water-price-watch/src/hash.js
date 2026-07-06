import crypto from 'node:crypto';

export function normalisePrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export function uniqueSortedPrices(orders = []) {
  return [...new Set(
    orders
      .map((order) => normalisePrice(order.price))
      .filter((price) => price !== null)
  )].sort((a, b) => a - b);
}

export function buildPriceHash(orders = []) {
  const prices = uniqueSortedPrices(orders);
  const signature = JSON.stringify(prices);
  return crypto.createHash('sha256').update(signature).digest('hex');
}

export function formatPrice(price) {
  const value = normalisePrice(price);
  if (value === null) return 'n/a';
  return `$${value.toLocaleString('en-AU', { maximumFractionDigits: 2 })}/ML`;
}
