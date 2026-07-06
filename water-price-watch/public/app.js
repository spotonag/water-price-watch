const elements = {
  connectionStatus: document.querySelector('#connectionStatus'),
  bestPrice: document.querySelector('#bestPrice'),
  topPrices: document.querySelector('#topPrices'),
  orderCount: document.querySelector('#orderCount'),
  lastChecked: document.querySelector('#lastChecked'),
  targetZone: document.querySelector('#targetZone'),
  sourceLabel: document.querySelector('#sourceLabel'),
  ordersBody: document.querySelector('#ordersBody'),
  refreshButton: document.querySelector('#refreshButton'),
  checkAlertButton: document.querySelector('#checkAlertButton'),
  actionMessage: document.querySelector('#actionMessage'),
  historyList: document.querySelector('#historyList'),
  alertList: document.querySelector('#alertList'),
  warningsPanel: document.querySelector('#warningsPanel'),
  warningsList: document.querySelector('#warningsList'),
  accessPanel: document.querySelector('#accessPanel'),
  accessCode: document.querySelector('#accessCode'),
  saveAccessCode: document.querySelector('#saveAccessCode')
};

let accessCode = localStorage.getItem('waterPriceWatchAccessCode') || '';
elements.accessCode.value = accessCode;

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `$${number.toLocaleString('en-AU', { maximumFractionDigits: 2 })}/ML`;
}

function formatTime(value) {
  if (!value) return 'Not checked yet';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Adelaide',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(accessCode ? { 'x-app-access-code': accessCode } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    elements.accessPanel.hidden = false;
    throw new Error('Access code required or incorrect.');
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderStatus(data) {
  const latest = data.latest;
  const target = data.target || {};

  elements.connectionStatus.textContent = latest ? 'Live' : 'No baseline yet';
  elements.targetZone.textContent = target.zone || 'Vic Goulburn Zone 1A';

  if (!latest) {
    elements.bestPrice.textContent = '—';
    elements.topPrices.textContent = '—';
    elements.orderCount.textContent = '—';
    elements.lastChecked.textContent = 'Press refresh to take the first snapshot';
    elements.ordersBody.innerHTML = '<tr><td colspan="4">No saved snapshot yet.</td></tr>';
    return;
  }

  elements.bestPrice.textContent = formatPrice(latest.bestPrice);
  elements.topPrices.textContent = latest.prices?.length ? latest.prices.slice(0, 3).map(formatPrice).join(', ') : 'No prices found';
  elements.orderCount.textContent = String(latest.orders?.length || 0);
  elements.lastChecked.textContent = `Checked ${formatTime(latest.checkedAt)}`;
  elements.sourceLabel.textContent = latest.source || 'snapshot';

  const orders = latest.orders || [];
  elements.ordersBody.innerHTML = orders.length
    ? orders.map((order, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${formatPrice(order.price)}</strong></td>
        <td>${order.volumeMl ?? '—'}</td>
        <td class="raw-cell">${escapeHtml(order.rowText || '')}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="4">No sell-order prices parsed.</td></tr>';

  const warnings = latest.scraperWarnings || [];
  elements.warningsPanel.hidden = warnings.length === 0;
  elements.warningsList.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('');

  elements.historyList.innerHTML = (data.history || []).slice(0, 8).map((item) => `
    <li>${formatTime(item.checkedAt)} — ${item.prices?.length ? item.prices.map(formatPrice).join(', ') : 'no prices'} — ${item.source}</li>
  `).join('') || '<li>No checks yet.</li>';

  elements.alertList.innerHTML = (data.alerts || []).slice(0, 6).map((alert) => `
    <li>${formatTime(alert.sent_at)} — ${escapeHtml(alert.status)}<br><small>${escapeHtml(alert.message || '')}</small></li>
  `).join('') || '<li>No SMS alerts yet.</li>';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadStatus() {
  try {
    elements.connectionStatus.textContent = 'Loading';
    const data = await api('/api/status');
    renderStatus(data);
  } catch (error) {
    elements.connectionStatus.textContent = 'Needs attention';
    elements.actionMessage.textContent = error.message;
  }
}

async function runAction(button, path, message) {
  button.disabled = true;
  elements.actionMessage.textContent = message;
  try {
    const data = await api(path, { method: 'POST', body: '{}' });
    elements.actionMessage.textContent = data.changed
      ? 'Price change detected. Dashboard updated.'
      : 'Checked successfully. No price change detected.';
    await loadStatus();
  } catch (error) {
    elements.actionMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

elements.refreshButton.addEventListener('click', () => {
  runAction(elements.refreshButton, '/api/refresh', 'Refreshing Ruralco sell orders now...');
});

elements.checkAlertButton.addEventListener('click', () => {
  runAction(elements.checkAlertButton, '/api/check', 'Checking now and sending SMS only if price changed...');
});

elements.saveAccessCode.addEventListener('click', () => {
  accessCode = elements.accessCode.value.trim();
  localStorage.setItem('waterPriceWatchAccessCode', accessCode);
  elements.accessPanel.hidden = true;
  loadStatus();
});

loadStatus();
setInterval(loadStatus, 60_000);
