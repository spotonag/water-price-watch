# Water Price Watch — Build Plan

*Prepared 8 July 2026 · for Steven Lanyon*

Water Price Watch is a mobile-first web app that watches Australian water market sell orders and texts subscribers when prices move. It scrapes the public market listings shown on ruralcowater.com.au (powered by Water Exchange), checks every 30 minutes, and sends an SMS via Twilio when the lowest sell price in a watched market/zone changes. Users browse any market, state, and zone; verified and approved subscribers choose the combinations they want alerts for.

## What we've agreed

Alerts fire on a change in the **lowest sell price** for a subscribed market/zone combination, checked **every 30 minutes**, sent **6am–9pm Sydney time**, with overnight movements rolled into a single morning summary. Sell orders appearing in an empty market, or the last one disappearing, also trigger an alert. The app covers **all markets and all states** on the source site, discovered automatically rather than hardcoded. Sign-up is open: a visitor picks their combos, verifies their mobile with an SMS code, and waits in a pending queue until Steve approves them from a link sent to his phone. The app itself needs no login — browsing is public and the watchlist is remembered on the device. Refreshing the app shows the latest 30-minute snapshot instantly, with a "fetch live now" button for an on-demand scrape. Design is the approved mockup: clean and light, water-blue accent, price-first cards showing the top three sell prices with volumes, installable as a PWA.

## Architecture

Everything lives in one GitHub repository and deploys automatically to Render on every push.

**Web service (Render, Starter instance).** Serves the app, the sign-up flow, the admin page, and a small JSON API the app reads. Runs continuously so pages load instantly.

**Scraper job (Render Cron Job, every 30 minutes).** Loads each market/zone combination that has at least one approved subscriber, extracts the sell-order ladder, stores a snapshot, compares the lowest sell price against the previous snapshot, and sends SMS alerts through Twilio when it changed. A nightly run additionally walks the site's market → state → zone pickers and refreshes the catalogue table, so new or renamed zones appear in the app automatically. Running the scraper as its own job means a scraper crash can never take the app down.

**Postgres (Render, Basic plan).** Six tables carry the whole system: `catalogue` (the market/state/zone tree), `snapshots` (each scrape's ladder and lowest price, which also feeds the history chart), `subscribers` (name, mobile, status: pending/active/paused), `subscriptions` (subscriber ↔ combo), `alerts_log` (every SMS sent, for the admin page and cost tracking), and `settings` (quiet hours, master pause, monthly SMS cap).

**Twilio.** One Australian mobile number sends alerts and receives STOP replies (Twilio handles opt-out compliance automatically). Twilio Verify runs the sign-up confirmation codes. Credentials live in Render environment variables, never in the repo.

**Stack.** Node.js throughout — one language for scraper, server, and alert logic. Express for the web service, Playwright for scraping if needed (see Phase 0), the official Twilio SDK, and a dependency-light server-rendered front end with the mockup's styling. Nothing exotic: boring, maintainable choices.

## The alert pipeline in detail

Each 30-minute run: fetch the watched combos → for each, scrape the current sell ladder → write a snapshot → compare lowest sell to the previous snapshot. On change inside quiet-hours daytime, text every active subscriber of that combo, e.g. `WPW: Temp allocation, Goulburn 1A low sell $585 → $560/ML (48 ML at that price). Reply STOP to opt out.` Changes detected overnight are recorded but not sent; the first run after 6am sends one summary per changed combo ("Overnight: low sell moved $585 → $560"). If a scrape fails twice in a row, Steve gets a direct "scraper needs attention" SMS — silence must never be ambiguous. A monthly SMS cap in settings pauses alerting and texts Steve if costs run away.

## Build order

**Phase 0 — Prove the data (the critical unknown).** Before anything else: confirm we can read live sell orders. First choice is finding the JSON endpoint the Water Exchange widget calls (fast, cheap, robust); fallback is headless Chrome reading the rendered page. This phase also confirms whether the data is truly public or login-gated, and settles the catalogue discovery approach. Deliverable: a script that prints today's real Goulburn Zone 1A sell ladder. Everything else depends on this, so it goes first.

**Phase 1 — Live alerts to Steve (the original ask).** Repo, database schema, the 30-minute scraper job, change detection, quiet hours and morning summary, Twilio sending — hardcoded to Steve's number and Goulburn 1A only. This gets the thing you first described working end-to-end quickly, and every later phase builds on proven plumbing.

**Phase 2 — The app.** The mockup made real: watchlist cards with top-three prices, detail screen with ladder and history chart (fed by stored snapshots), browse across the full catalogue, fetch-live-now, PWA installability.

**Phase 3 — Subscribers and admin.** Sign-up with zone/market selection, Twilio Verify, the pending-approval queue with SMS notification to Steve, and the password-protected admin page: approvals, subscriber roster with SMS-cost counter, system health, and controls (master pause, test SMS, force scrape, refresh catalogue, quiet-hours editing).

**Phase 4 — Hardening.** Alert log polish, backups, rate-limited admin login, the monthly SMS cap, and optionally a custom domain (e.g. waterpricewatch.com.au).

Each phase ends with something working that you can poke at and redirect — same as the mockup round.

## Running costs (verified July 2026)

| Item | Cost |
|---|---|
| Render web service (Starter) | US$7/month |
| Render cron job | ~US$1/month minimum (billed per run-second) |
| Render Postgres (Basic 256MB) | US$6/month |
| Twilio Australian mobile number | US$8.25/month |
| SMS to AU mobiles | ~US$0.0515 per message |
| Inbound SMS (STOP replies etc.) | US$0.0075 per message |

Fixed base is roughly **US$22/month (~A$33)** before message volume. Message volume is the variable to watch: 10 subscribers averaging 4 price-change alerts a day is about US$62/month, which is why the admin page shows a live SMS counter and a cap exists. Render's free tiers exist but aren't suitable here — free web services sleep between visits and free Postgres expires after 30 days.

## What Steve needs to provide

A GitHub account (the repo can live under yours or start under a new one), a Render account with a payment card, and a Twilio account with some credit plus the AU number purchase — I'll walk you through each signup when we get there. You'll also choose the admin password and confirm the mobile number that receives admin alerts. Optional, later: a domain name.

## Risks, honestly stated

The app depends on scraping a third-party site. If Water Exchange redesigns pages or blocks automated access, the scraper needs a patch — the broke-alert SMS ensures we know within an hour. Phase 0 may reveal that live order data sits behind a login; if so, the options are registering a Water Exchange account for the scraper to use, or contacting them about a data feed, and we'd decide together before proceeding. It's also worth a quick read of the site's terms of use during Phase 0 so we know where we stand. Finally, SMS costs scale with subscribers and market volatility — the cap and counter are the safety net.
