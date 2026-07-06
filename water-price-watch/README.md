# Water Price Watch

Water Price Watch monitors Ruralco Water sell-order prices for:

- Market: `TEMPORARY ALLOCATION MARKETS`
- State: `VIC`
- Zone: `Vic Goulburn_Zone 1A`

It shows the latest parsed sell orders in a small web dashboard and sends an SMS with Twilio every 30 minutes **only when the unique sell-order price list changes**.

## What it does

- Opens the Ruralco Water Markets page with Playwright.
- Selects Temporary Allocation Markets.
- Selects VIC.
- Selects Vic Goulburn_Zone 1A.
- Reads the Sell Orders section only.
- Stores each check in Postgres.
- Sends Twilio SMS when the sell-order price list changes.
- Lets the user refresh the app manually to update the dashboard immediately.

## App behavior

### Scheduled checker

The Render cron job runs every 30 minutes using:

```cron
*/30 * * * *
```

On the first run it creates a baseline and does **not** send an SMS. On later runs, it compares the latest unique sell-order prices with the previous saved snapshot.

### Manual dashboard refresh

The dashboard `Refresh prices now` button updates the saved snapshot but does not send an SMS. That is intentional so opening the app does not send surprise SMS messages.

There is also a `Check now + send SMS if changed` button for testing.

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies:

```bash
npm install
npx playwright install chromium
```

3. Copy the env file:

```bash
cp .env.example .env
```

4. Set `DATABASE_URL` to a local or hosted Postgres database.
5. Start the app:

```bash
npm start
```

6. Open:

```text
http://localhost:3000
```

## Render setup

This repo includes `render.yaml` for a Render Blueprint with:

- Web Service: Water Price Watch dashboard and API
- Cron Job: checker every 30 minutes
- Postgres database: shared state for snapshots and alerts

Render environment variables to set manually:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
ALERT_TO_NUMBER
APP_ACCESS_CODE
```

`APP_ACCESS_CODE` is optional but recommended. If set, the dashboard will ask for the code before it can read or refresh data.

## Twilio setup

Use an SMS-capable Twilio number for `TWILIO_FROM_NUMBER`.

Use your own mobile number for `ALERT_TO_NUMBER`, for example:

```text
+614xxxxxxxx
```

## Main commands

Start web app:

```bash
npm start
```

Run one scheduled check manually:

```bash
npm run check
```

## Important scraper note

The Ruralco page is JavaScript-heavy, so the scraper uses Playwright instead of a plain HTML fetch.

If Ruralco changes the dropdown or table markup, the app may still open the page but fail to choose the zone or parse prices. In that case:

1. Set `DEBUG_SCRAPER=true` in Render.
2. Run a manual check.
3. Review the scraper warnings in the dashboard/logs.
4. Adjust `src/scraper.js` selectors if needed.

## Alert rule

The alert is based on the unique price list, not order volume.

Example:

- Previous prices: `$210/ML`, `$220/ML`
- New prices: `$210/ML`, `$225/ML`
- SMS sent: yes

Example:

- Previous prices: `$210/ML`, `$220/ML`
- New orders have different ML but still `$210/ML`, `$220/ML`
- SMS sent: no

## Folder structure

```text
water-price-watch/
  public/
    index.html
    styles.css
    app.js
  src/
    alerts.js
    check.js
    checker.js
    config.js
    db.js
    hash.js
    scraper.js
    server.js
    time.js
  .env.example
  package.json
  render.yaml
```
