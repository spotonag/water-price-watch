import { config } from './config.js';
import { initDb, getLatestSnapshot, insertSnapshot, insertAlertEvent } from './db.js';
import { scrapeSellOrders } from './scraper.js';
import { buildPriceHash, uniqueSortedPrices } from './hash.js';
import { buildAlertMessage, sendSmsAlert } from './alerts.js';

export async function runWaterCheck({ source = 'manual', sendAlerts = false } = {}) {
  await initDb();

  const target = {
    market: config.ruralco.marketLabel,
    state: config.ruralco.stateLabel,
    zone: config.ruralco.zoneLabel
  };

  const previous = await getLatestSnapshot(target);
  const scraped = await scrapeSellOrders();
  const prices = uniqueSortedPrices(scraped.orders);
  const priceHash = buildPriceHash(scraped.orders);

  const snapshot = await insertSnapshot({
    ...target,
    source,
    orders: scraped.orders,
    prices,
    bestPrice: prices[0] ?? null,
    priceHash,
    scraperWarnings: scraped.warnings,
    rawSellSection: scraped.rawSellSection
  });

  const changed = Boolean(previous && previous.priceHash !== snapshot.priceHash);
  const baselineCreated = !previous;
  let alert = null;

  if (sendAlerts && changed) {
    const message = buildAlertMessage({ current: snapshot, previous });
    try {
      const sms = await sendSmsAlert(message);
      alert = await insertAlertEvent({
        snapshotId: snapshot.id,
        status: sms.status,
        message,
        error: sms.error || null
      });
    } catch (error) {
      alert = await insertAlertEvent({
        snapshotId: snapshot.id,
        status: 'failed',
        message,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    target,
    snapshot,
    previous,
    changed,
    baselineCreated,
    alert,
    sendAlerts,
    source
  };
}
