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
- `rates.html` — Rates & fees tables (structure complete; values to be confirmed by the bank)
- `branches.html` — Branch & ATM locator with an OpenStreetMap embed
- `contact.html` — Contact form (frontend only; delivery still to come)
- `admin.html` — Private staff dashboard (direct URL only, not linked from
  the navigation): sign-in, overview stats, search/filters/sort/pagination,
  application detail with ID photo and history timeline, approve / reject /
  request deposit / confirm deposit / reopen / delete, CSV export
- `faq.html` — FAQ accordion
- `legal.html` — Privacy / terms placeholders
- `open-account.html` — Account application form: submits to the backend
  (`POST /api/submit-application`) and shows the real reference returned

## Structure

- `css/style.css` — shared stylesheet (mobile-first, blue/white brand)
- `js/main.js` — mobile nav, FAQ accordion, local form confirmation states
- `js/calculators.js` — loan calculator, savings calculator, indicative currency converter
- `js/open-account.js` — submits the application form to the backend
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
  email is configured.
- `POST /api/admin-delete` — deletes an application and its events.
- `GET /api/admin-export` — the filtered list as a CSV download.
- Workflow: `pending → approved → deposit_requested → active`, plus
  `rejected` (reopenable to `pending`).

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
