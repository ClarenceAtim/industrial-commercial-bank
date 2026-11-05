# Industrial Commercial Bank — Marketing Website

A professional bank marketing website with a working account-application
backend (Vercel serverless functions + Neon Postgres). This is NOT online
banking: no money ever moves here and there are no real account logins; the
application form sends data to the bank for review, and staff review it in
a private dashboard.

## Pages

- `index.html` — Home: hero, trust signals, main services, 3-step account opening, CTA
- `personal.html` — Personal banking: accounts, savings calculator, cards, transfers, currency converter
- `business.html` — Business banking: accounts, loans, payroll, merchant services
- `loans.html` — Loans: loan types + working loan calculator (frontend JS only)
- `digital.html` — Digital banking: mobile app, USSD, Mobile Money, cards
- `transfers.html` — Money transfers: pick a destination bank by region (Africa, Europe, America, Asia), then send a transfer **request** — reviewed by the bank before the transfer is made; no instant transfers, no money moves here
- `rates.html` — Rates & fees tables (structure complete; values to be confirmed by the bank)
- `branches.html` — Branch & ATM locator with an OpenStreetMap embed
- `contact.html` — Contact form (frontend only; delivery still to come)
- `admin.html` — Private staff dashboard (direct URL only, not linked from
  the navigation): sign-in, three views — **Applications** (overview stats,
  search/filters/sort/pagination, application detail with ID photo and
  history timeline, approve / reject / request deposit / confirm deposit /
  reopen / delete, CSV export), **Client accounts** (account list with
  balances, account detail with transaction history, record a deposit or
  withdrawal, put an account on hold / release the hold) and **Transfers**
  (transfer-request list with search/filters/sort/pagination, request
  detail, approve / reject with a note). The accounts
  section is **record-keeping only**: it records deposits and withdrawals
  that happened at the bank itself and shows the resulting balances; no
  money ever moves through this site.
- `faq.html` — FAQ accordion
- `legal.html` — Privacy / terms placeholders
- `open-account.html` — Account application form: submits to the backend
  (`POST /api/submit-application`) and shows the real reference returned

## Structure

- `css/style.css` — shared stylesheet (mobile-first, blue/white brand)
- `js/main.js` — mobile nav, FAQ accordion, local form confirmation states
- `js/calculators.js` — loan calculator, savings calculator, indicative currency converter
- `js/open-account.js` — submits the application form to the backend
- `js/transfers.js` — region tabs, destination-bank cards, transfer-request form
- `js/admin.js` — staff dashboard behaviour
- `js/translator.js` + `languages/*.json` (fr, en, es, pt, ar, de, zh, th, vi, ja, ko) — FR/EN toggle (French primary)
- `api/` — Vercel serverless functions (Node, `pg` + `nodemailer` only)
- `images/logo.svg` — logo: three interlocking coin rings (deep/mid/light blue) over a foundation bar

## Brand

- Colours: deep professional blue `#0B3D91`, mid blue `#1E6FB8`, light blue `#5B9BD5`, white
- Logo: three ancient-coin-inspired interlocking rings = stability and building foundations

## Placeholders left for the client (nothing fake is live)

- Phone number, email address, head-office/branch addresses
- WhatsApp number (floating button currently links to the contact page)
- Branch and ATM locations (map is centred on Douala as an indicative placeholder)
- Savings/loan rates and service fees (tables show "[Rate/Fee to be confirmed]")
- App-store links and USSD code
- Legal-entity details on the legal page
- Main services list will grow as the client adds services

## Deploy

Static site, no build step. Any static host works (Vercel: import the repo, no build
command, output directory = repository root). Vercel setup is a separate step.

## Phase 2 — account-application backend (done)

- `POST /api/submit-application` — validates the form (photo under 5 MB),
  stores the application as `pending` with a unique reference
  (`ICB-YYYY-XXXXXX`) and a `submitted` history event.
- `POST /api/admin-login` — staff sign-in; returns an 8-hour token
  (HMAC-SHA256, `ADMIN_SECRET`).
- `GET /api/admin-applications` — filtered/sorted/paginated list (no photo
  bytes) plus overview stats (total, pending, approved, deposit requested,
  active, rejected, this month).
- `GET /api/admin-application?id=` — one application with the ID photo
  (base64) and the history timeline from `application_events`.
- `POST /api/admin-review` — decisions with strict transitions:
  `approved` / `rejected` (from pending), `deposit_requested` (from
  approved), `deposit_received` (from deposit_requested, sets status
  `active`), `reopened` (from approved or rejected, back to pending). Each
  decision records an event and emails the applicant automatically when
  email is configured. Confirming a deposit **requires the received amount**
  (and optional currency, default XAF): it opens the client account with a
  unique 10-digit account number starting with `1`, sets the opening
  balance to that amount, and records the first transaction.
- `POST /api/admin-delete` — deletes an application and its events.
- `GET /api/admin-export` — the filtered list as a CSV download.
- Workflow: `pending → approved → deposit_requested → active`, plus
  `rejected` (reopenable to `pending`).

### Client accounts (record-keeping only — no money moves through this site)

The accounts section records what happened at the bank itself: a deposit
received at the counter, a withdrawal paid out at the branch, a hold placed
on an account. Staff enter those movements here and the dashboard shows the
resulting balance. It never moves money.

- `GET /api/admin-accounts` — filtered/sorted/paginated account list
  (account number, client, balance with currency, status) plus totals:
  total accounts, accounts on hold, summed balance per currency.
- `GET /api/admin-account?id=` (or `?application_id=`) — one account with
  the linked client/application fields and the full transaction history.
- `POST /api/admin-transaction` — record a `deposit` or `withdrawal`
  (amount above zero, at most two decimals). Refuses on-hold accounts and
  withdrawals above the balance, so a balance can never go below zero.
  Updates the balance and writes the movement to the application history.
- `POST /api/admin-hold` — `hold` or `release` an account (two-step
  confirm in the dashboard). A held account accepts no transactions until
  released. Each change is written to the application history.
- Tables: `accounts` (one per approved application, unique 10-digit number,
  currency default `XAF`, balance never below zero, status
  `active`/`on_hold`) and `transactions` (`deposit`/`withdrawal`, amount
  above zero).

### Money transfers — request flow only (no money moves through this site)

`transfers.html` is a transfer **request** flow, not an instant transfer:
the client picks a destination bank from the published lists (four regions
— Africa, Europe, America, Asia — 8 well-known banks each, bank and country
names shown as-is in every language), fills in sender, recipient and
amount, and submits. The page states plainly that the bank reviews the
request before the transfer is made. Staff approve or reject the request
in the dashboard; the transfer itself is then processed offline by the
bank.

- `POST /api/submit-transfer` — validates the request (all required
  fields, email format, amount above zero with at most two decimals,
  currency as a 3-letter code defaulting to `XAF`, region one of
  `africa`/`europe`/`america`/`asia`, destination bank matching one of the
  listed banks for that region), stores it as `pending` with a unique
  reference (`TRF-YYYY-XXXXXX`, retried on collision) and returns
  `{ ok: true, reference }`. A notice email goes to the bank when email is
  configured; a mail failure never fails the submission.
- `GET /api/admin-transfers` — staff list (Bearer auth): newest first,
  search on sender name / reference / destination bank, filters by status
  and region, sort by date / reference / amount, pagination, plus overview
  stats (total, pending, approved, rejected).
- `POST /api/admin-transfer-review` — staff decision (Bearer auth):
  `{ id, decision: approved|rejected, note }`. Only `pending → approved`
  and `pending → rejected` are allowed; any other transition is refused
  with a clear error. Each decision updates status, admin note and
  `reviewed_at`, and emails the requester automatically when email is
  configured (approved = the transfer will be processed; rejected = not
  approved, politely, with the note when one was given).
- Table: `transfer_requests` (reference, sender, sender account, destination
  bank / region / country, recipient, recipient account, amount, currency,
  purpose, status `pending`/`approved`/`rejected`, admin note, timestamps).

### Environment variables (Vercel project settings — never in the repo)

- `DATABASE_URL` — Neon Postgres connection string (SSL).
- `ADMIN_PASSWORD` — staff dashboard password.
- `ADMIN_SECRET` — secret used to sign staff tokens.
- Optional email (all five needed, otherwise email is skipped silently):
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `ADMIN_NOTIFY_EMAIL` (new-application notices).

### Still to supply

- Deposit amount and payment details: placeholders
  (`DEPOSIT_AMOUNT`, `DEPOSIT_PAYMENT_DETAILS`) at the top of
  `api/_mail.js` — fill them in before the deposit step goes live.
- SMTP details (see above) before any decision email can be sent.
- Contact-form delivery, real rates/fees, real branch data, real WhatsApp
  number.
