import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { config } from './config.js';
import { normalisePrice } from './hash.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function relaxedRegex(label) {
  const escaped = escapeRegExp(label)
    .replace(/\\_/g, '[ _\\-]*')
    .replace(/\s+/g, '\\s+');
  return new RegExp(escaped, 'i');
}

async function allFrames(page) {
  return [page.mainFrame(), ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function trySelectOptionByTextInFrame(frame, label, warnings) {
  const selectCount = await frame.locator('select').count().catch(() => 0);
  const patternSource = relaxedRegex(label).source;

  for (let index = 0; index < selectCount; index += 1) {
    const select = frame.locator('select').nth(index);
    const options = await select.locator('option').evaluateAll(
      (nodes, source) => {
        const pattern = new RegExp(source, 'i');
        return nodes.map((node) => ({
          text: node.textContent || '',
          value: node.getAttribute('value') || ''
        })).filter((option) => pattern.test(option.text) || pattern.test(option.value));
      },
      patternSource
    ).catch(() => []);

    if (options.length > 0) {
      const selected = options[0];
      try {
        await select.selectOption({ value: selected.value }, { timeout: 4000 });
      } catch {
        await select.selectOption({ label: selected.text.trim() }, { timeout: 4000 }).catch(() => null);
      }

      await select.evaluate((element) => {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => null);

      warnings.push(`Selected native option "${selected.text.trim()}" for "${label}".`);
      return true;
    }
  }

  return false;
}

async function tryClickTextInFrame(frame, label, warnings) {
  const regex = relaxedRegex(label);
  const locators = [
    frame.getByRole('button', { name: regex }),
    frame.getByRole('link', { name: regex }),
    frame.getByText(regex)
  ];

  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const item = locator.nth(index);
      try {
        await item.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => null);
        await item.click({ timeout: 4000, force: true });
        warnings.push(`Clicked visible text for "${label}".`);
        return true;
      } catch {
        // Try next match.
      }
    }
  }

  return false;
}

async function chooseLabel(page, label, warnings) {
  for (const frame of await allFrames(page)) {
    if (await trySelectOptionByTextInFrame(frame, label, warnings)) return true;
  }

  for (const frame of await allFrames(page)) {
    if (await tryClickTextInFrame(frame, label, warnings)) return true;
  }

  warnings.push(`Could not automatically choose "${label}". The page may have changed selectors.`);
  return false;
}

async function collectPageText(page) {
  const texts = [];
  for (const frame of await allFrames(page)) {
    const text = await frame.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (text && text.trim()) texts.push(text);
  }
  return texts.join('\n\n--- FRAME ---\n\n');
}

function sellSectionFromText(text) {
  const startMatch = text.match(/Sell\s+Orders[\s\S]*?(?=Buy\s+Orders|Trades\s+In\s+Progress|Transactions\s+in\s+Progress|Completed\s+Trades|Registry\s+Pricing|Trading\s+Zone\s+Information|$)/i);
  return startMatch ? startMatch[0] : '';
}

function parsePrice(value) {
  return normalisePrice(value);
}

function parseVolume(value) {
  if (!value) return null;
  const match = String(value).match(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:ML|megalitres?)/i);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function rowLooksLikeNoise(rowText) {
  return /Showing:|Previous|Next|portal login|register|Powered By|Sell Orders|Buy Orders|Trades In Progress|Completed Trades/i.test(rowText);
}

function parseOrdersFromTableRows(rows) {
  const orders = [];
  rows.forEach((cells, index) => {
    const cleanCells = cells.map((cell) => cell.trim()).filter(Boolean);
    const rowText = cleanCells.join(' | ');
    if (!rowText || rowLooksLikeNoise(rowText)) return;

    const priceCell = cleanCells.find((cell) => /\$\s*[0-9]/.test(cell))
      || cleanCells.find((cell) => /price/i.test(rowText) ? false : /^\d{2,5}(?:\.\d{1,2})?$/.test(cell.replace(/,/g, '')));

    const price = parsePrice(priceCell);
    if (price === null) return;

    orders.push({
      order: orders.length + 1,
      price,
      volumeMl: parseVolume(rowText),
      rowText,
      source: 'table'
    });
  });
  return orders;
}

async function parseOrdersFromDomTables(page) {
  const orders = [];

  for (const frame of await allFrames(page)) {
    const frameOrders = await frame.evaluate(() => {
      function textOf(node) {
        return (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
      }

      function priorText(table) {
        const bits = [];
        let node = table.previousElementSibling;
        let steps = 0;
        while (node && steps < 8) {
          bits.push(textOf(node));
          node = node.previousElementSibling;
          steps += 1;
        }
        return bits.join(' | ');
      }

      return [...document.querySelectorAll('table')].map((table) => {
        const context = `${priorText(table)} | ${textOf(table.closest('section, div, article') || table)}`;
        const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map(textOf));
        return { context, rows };
      });
    }).catch(() => []);

    for (const table of frameOrders) {
      if (!/Sell\s+Orders/i.test(table.context) || /Buy\s+Orders/i.test(table.context.split(/Sell\s+Orders/i).pop() || '')) {
        // Keep going: some wrapped containers include all sections together.
      }
      const parsed = parseOrdersFromTableRows(table.rows || []);
      if (parsed.length > 0 && /Sell\s+Orders/i.test(table.context)) {
        orders.push(...parsed);
      }
    }
  }

  return orders;
}

function parseOrdersFromSellText(section) {
  const lines = section
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const orders = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (rowLooksLikeNoise(line)) continue;

    const priceMatches = [...line.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d+)?)/g)];
    for (const match of priceMatches) {
      const price = parsePrice(match[1]);
      if (price === null) continue;
      const nearbyText = [lines[i - 2], lines[i - 1], line, lines[i + 1], lines[i + 2]].filter(Boolean).join(' | ');
      orders.push({
        order: orders.length + 1,
        price,
        volumeMl: parseVolume(nearbyText),
        rowText: nearbyText,
        source: 'text'
      });
    }
  }

  // If the site uses bare numeric price columns without a dollar sign, try to parse rows with ML + a likely price.
  if (orders.length === 0) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (rowLooksLikeNoise(line)) continue;
      const numbers = [...line.matchAll(/\b([0-9][0-9,]*(?:\.\d+)?)\b/g)]
        .map((match) => Number(match[1].replace(/,/g, '')))
        .filter((value) => Number.isFinite(value));
      const likelyPrice = numbers.find((value) => value >= 1 && value <= 5000);
      if (likelyPrice !== undefined && /\bML\b|Zone|Goulburn|Vic/i.test(line)) {
        orders.push({
          order: orders.length + 1,
          price: likelyPrice,
          volumeMl: parseVolume(line),
          rowText: line,
          source: 'text-fallback'
        });
      }
    }
  }

  return orders;
}

function dedupeOrders(orders) {
  const seen = new Set();
  const output = [];
  for (const order of orders) {
    const key = `${order.price}|${order.volumeMl ?? ''}|${order.rowText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ ...order, order: output.length + 1 });
  }
  return output;
}

export async function scrapeSellOrders() {
  const warnings = [];
  const candidateResponses = [];
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 WaterPriceWatch/1.0'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(config.ruralco.timeoutMs);

    page.on('response', async (response) => {
      try {
        const request = response.request();
        const type = request.resourceType();
        const contentType = response.headers()['content-type'] || '';
        if (!['xhr', 'fetch'].includes(type) && !/json|text|html/i.test(contentType)) return;
        const url = response.url();
        const text = await response.text().catch(() => '');
        if (/Sell\s*Orders|Goulburn|Zone\s*1A|Vic/i.test(text) || /water|market|exchange|order/i.test(url)) {
          candidateResponses.push({ url, status: response.status(), body: text.slice(0, 12000) });
        }
      } catch {
        // Ignore response bodies we cannot read.
      }
    });

    await page.goto(config.ruralco.url, { waitUntil: 'networkidle', timeout: config.ruralco.timeoutMs });

    await chooseLabel(page, config.ruralco.marketLabel, warnings);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1200);

    await chooseLabel(page, config.ruralco.stateLabel, warnings);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1200);

    await chooseLabel(page, config.ruralco.zoneLabel, warnings);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(2500);

    const pageText = await collectPageText(page);
    const rawSellSection = sellSectionFromText(pageText);

    if (config.ruralco.debug) {
      await fs.mkdir('/tmp/water-price-watch', { recursive: true });
      await fs.writeFile('/tmp/water-price-watch/page.html', await page.content(), 'utf8');
      await fs.writeFile('/tmp/water-price-watch/page.txt', pageText, 'utf8');
      await page.screenshot({ path: '/tmp/water-price-watch/page.png', fullPage: true }).catch(() => null);
      warnings.push('Debug files written to /tmp/water-price-watch on the Render instance.');
    }

    if (!/Sell\s+Orders/i.test(rawSellSection)) {
      const responseHint = candidateResponses.find((item) => /Sell\s*Orders|Goulburn|Zone\s*1A/i.test(item.body));
      throw new Error(`Could not find the Sell Orders section after selecting market/state/zone. ${responseHint ? `Candidate response URL: ${responseHint.url}` : ''}`);
    }

    const tableOrders = await parseOrdersFromDomTables(page);
    const textOrders = parseOrdersFromSellText(rawSellSection);
    const orders = dedupeOrders([...tableOrders, ...textOrders]);

    const selectedZoneSeen = relaxedRegex(config.ruralco.zoneLabel).test(pageText);
    if (!selectedZoneSeen) {
      warnings.push(`The selected zone label "${config.ruralco.zoneLabel}" was not found in rendered page text. Confirm the exact Ruralco zone wording.`);
    }

    if (orders.length === 0) {
      warnings.push('No sell-order prices were parsed. This may mean there are no current sell orders, or the Ruralco table markup has changed.');
    }

    return {
      market: config.ruralco.marketLabel,
      state: config.ruralco.stateLabel,
      zone: config.ruralco.zoneLabel,
      orders,
      rawSellSection,
      warnings,
      capturedResponseCount: candidateResponses.length
    };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}
