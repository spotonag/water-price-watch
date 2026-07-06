import { runWaterCheck } from './checker.js';

try {
  const result = await runWaterCheck({ source: 'cron', sendAlerts: true });
  console.log(JSON.stringify({
    ok: true,
    checkedAt: result.snapshot.checkedAt,
    zone: result.snapshot.zone,
    prices: result.snapshot.prices,
    changed: result.changed,
    baselineCreated: result.baselineCreated,
    alertStatus: result.alert?.status || null,
    warnings: result.snapshot.scraperWarnings
  }, null, 2));
  process.exit(0);
} catch (error) {
  console.error('Water Price Watch check failed:', error);
  process.exit(1);
}
