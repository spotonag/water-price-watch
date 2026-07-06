import pg from 'pg';
import { config, assertRequiredRuntimeConfig } from './config.js';

const { Pool } = pg;

let pool;

export function getPool() {
  assertRequiredRuntimeConfig();
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

export async function initDb() {
  const client = getPool();
  await client.query(`
    CREATE TABLE IF NOT EXISTS water_snapshots (
      id BIGSERIAL PRIMARY KEY,
      market TEXT NOT NULL,
      state TEXT NOT NULL,
      zone TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'unknown',
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      orders JSONB NOT NULL DEFAULT '[]'::jsonb,
      prices JSONB NOT NULL DEFAULT '[]'::jsonb,
      best_price NUMERIC,
      price_hash TEXT NOT NULL,
      scraper_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw_sell_section TEXT
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id BIGSERIAL PRIMARY KEY,
      snapshot_id BIGINT REFERENCES water_snapshots(id) ON DELETE SET NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      error TEXT
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_water_snapshots_target_checked
    ON water_snapshots (market, state, zone, checked_at DESC);
  `);
}

export async function insertSnapshot(snapshot) {
  const client = getPool();
  const result = await client.query(
    `
      INSERT INTO water_snapshots
        (market, state, zone, source, checked_at, orders, prices, best_price, price_hash, scraper_warnings, raw_sell_section)
      VALUES
        ($1, $2, $3, $4, NOW(), $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, $10)
      RETURNING *;
    `,
    [
      snapshot.market,
      snapshot.state,
      snapshot.zone,
      snapshot.source,
      JSON.stringify(snapshot.orders || []),
      JSON.stringify(snapshot.prices || []),
      snapshot.bestPrice ?? null,
      snapshot.priceHash,
      JSON.stringify(snapshot.scraperWarnings || []),
      snapshot.rawSellSection || null
    ]
  );
  return toSnapshot(result.rows[0]);
}

export async function getLatestSnapshot({ market, state, zone } = {}) {
  const client = getPool();
  const params = [];
  let where = '';

  if (market && state && zone) {
    params.push(market, state, zone);
    where = 'WHERE market = $1 AND state = $2 AND zone = $3';
  }

  const result = await client.query(
    `
      SELECT *
      FROM water_snapshots
      ${where}
      ORDER BY checked_at DESC
      LIMIT 1;
    `,
    params
  );

  return result.rows[0] ? toSnapshot(result.rows[0]) : null;
}

export async function getRecentSnapshots(limit = 20) {
  const client = getPool();
  const result = await client.query(
    `
      SELECT *
      FROM water_snapshots
      ORDER BY checked_at DESC
      LIMIT $1;
    `,
    [limit]
  );
  return result.rows.map(toSnapshot);
}

export async function insertAlertEvent({ snapshotId, status, message, error = null }) {
  const client = getPool();
  const result = await client.query(
    `
      INSERT INTO alert_events (snapshot_id, status, message, error)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `,
    [snapshotId, status, message, error]
  );
  return result.rows[0];
}

export async function getRecentAlerts(limit = 10) {
  const client = getPool();
  const result = await client.query(
    `
      SELECT *
      FROM alert_events
      ORDER BY sent_at DESC
      LIMIT $1;
    `,
    [limit]
  );
  return result.rows;
}

function toSnapshot(row) {
  return {
    id: Number(row.id),
    market: row.market,
    state: row.state,
    zone: row.zone,
    source: row.source,
    checkedAt: row.checked_at,
    orders: row.orders || [],
    prices: row.prices || [],
    bestPrice: row.best_price === null ? null : Number(row.best_price),
    priceHash: row.price_hash,
    scraperWarnings: row.scraper_warnings || [],
    rawSellSection: row.raw_sell_section
  };
}
