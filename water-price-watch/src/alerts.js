import twilio from 'twilio';
import { config } from './config.js';
import { formatPrice } from './hash.js';
import { formatAdelaideTime } from './time.js';

function smsReady() {
  return Boolean(
    config.sms.enabled
    && config.sms.accountSid
    && config.sms.authToken
    && config.sms.fromNumber
    && config.sms.toNumber
  );
}

export function buildAlertMessage({ current, previous }) {
  const currentPrices = (current.prices || []).slice(0, 5).map(formatPrice).join(', ') || 'none found';
  const previousPrices = previous?.prices?.length ? previous.prices.slice(0, 5).map(formatPrice).join(', ') : 'no previous baseline';

  return [
    'Water Price Watch alert',
    `${current.zone} sell-order prices changed.`,
    `Now: ${currentPrices}.`,
    `Was: ${previousPrices}.`,
    `Checked: ${formatAdelaideTime(new Date(current.checkedAt || Date.now()))}.`
  ].join(' ');
}

export async function sendSmsAlert(message) {
  if (!smsReady()) {
    return {
      status: 'skipped',
      error: 'SMS not sent because Twilio variables are missing or SMS_ENABLED=false.'
    };
  }

  const client = twilio(config.sms.accountSid, config.sms.authToken);
  const result = await client.messages.create({
    body: message,
    from: config.sms.fromNumber,
    to: config.sms.toNumber
  });

  return {
    status: 'sent',
    sid: result.sid
  };
}
