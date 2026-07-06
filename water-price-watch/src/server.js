import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initDb, getLatestSnapshot, getRecentAlerts, getRecentSnapshots } from './db.js';
import { runWaterCheck } from './checker.js';
import { formatAdelaideTime } from './time.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAccess(req, res, next) {
  if (!config.appAccessCode) return next();
  const supplied = req.get('x-app-access-code') || req.query.accessCode || req.body?.accessCode;
  if (supplied === config.appAccessCode) return next();
  return res.status(401).json({ error: 'Access code required.' });
}

function target() {
  return {
    market: config.ruralco.marketLabel,
    state: config.ruralco.stateLabel,
    zone: config.ruralco.zoneLabel
  };
}

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, app: 'Water Price Watch', now: new Date().toISOString() });
});

app.get('/api/status', requireAccess, async (req, res, next) => {
  try {
    await initDb();
    const latest = await getLatestSnapshot(target());
    const alerts = await getRecentAlerts(5);
    const history = await getRecentSnapshots(20);

    res.json({
      app: 'Water Price Watch',
      target: target(),
      latest,
      alerts,
      history: history.map((snapshot) => ({
        id: snapshot.id,
        checkedAt: snapshot.checkedAt,
        checkedAtLocal: formatAdelaideTime(new Date(snapshot.checkedAt)),
        source: snapshot.source,
        prices: snapshot.prices,
        bestPrice: snapshot.bestPrice,
        orderCount: snapshot.orders.length,
        warnings: snapshot.scraperWarnings
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/refresh', requireAccess, async (req, res, next) => {
  try {
    const result = await runWaterCheck({
      source: 'manual-refresh',
      sendAlerts: false
    });

    res.json({
      ok: true,
      changed: result.changed,
      baselineCreated: result.baselineCreated,
      note: config.manualRefreshSavesBaseline
        ? 'Manual refresh saved this result as the latest baseline but did not send SMS.'
        : 'Manual refresh completed without SMS.',
      snapshot: result.snapshot,
      previous: result.previous
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/check', requireAccess, async (req, res, next) => {
  try {
    const result = await runWaterCheck({ source: 'manual-check-with-alert', sendAlerts: true });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: error instanceof Error ? error.message : 'Unknown server error'
  });
});

await initDb();

app.listen(config.port, () => {
  console.log(`Water Price Watch running on port ${config.port}`);
});
