import 'dotenv/config';

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function intFromEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intFromEnv(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appAccessCode: process.env.APP_ACCESS_CODE || '',
  databaseUrl: process.env.DATABASE_URL || '',
  ruralco: {
    url: process.env.RURALCO_URL || 'https://www.ruralcowater.com.au/home/',
    marketLabel: process.env.RURALCO_MARKET_LABEL || 'TEMPORARY ALLOCATION MARKETS',
    stateLabel: process.env.RURALCO_STATE_LABEL || 'VIC',
    zoneLabel: process.env.RURALCO_ZONE_LABEL || 'Vic Goulburn_Zone 1A',
    timeoutMs: intFromEnv(process.env.RURALCO_TIMEOUT_MS, 45_000),
    debug: boolFromEnv(process.env.DEBUG_SCRAPER, false)
  },
  sms: {
    enabled: boolFromEnv(process.env.SMS_ENABLED, true),
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
    toNumber: process.env.ALERT_TO_NUMBER || ''
  },
  manualRefreshSavesBaseline: boolFromEnv(process.env.MANUAL_REFRESH_SAVES_BASELINE, true)
};

export function assertRequiredRuntimeConfig() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required. Create a Render Postgres database or set DATABASE_URL locally.');
  }
}
