# Industrial Commercial Bank — Marketing Website

**Phase 1: frontend only.** A professional bank marketing website. This is NOT online
banking: no money ever moves here, there are no real account logins, and no form on
this site sends data anywhere yet.

## Pages

- `index.html` — Home: hero, trust signals, main services, 3-step account opening, CTA
- `personal.html` — Personal banking: accounts, savings calculator, cards, transfers, currency converter
- `business.html` — Business banking: accounts, loans, payroll, merchant services
- `loans.html` — Loans: loan types + working loan calculator (frontend JS only)
- `digital.html` — Digital banking: mobile app, USSD, Mobile Money, cards
- `rates.html` — Rates & fees tables (structure complete; values to be confirmed by the bank)
- `branches.html` — Branch & ATM locator with an OpenStreetMap embed
- `contact.html` — Contact form (frontend only; backend in Phase 2)
- `faq.html` — FAQ accordion
- `legal.html` — Privacy / terms placeholders
- `open-account.html` — Account application form UI with a local "under review" confirmation state

## Structure

- `css/style.css` — shared stylesheet (mobile-first, blue/white brand)
- `js/main.js` — mobile nav, FAQ accordion, local form confirmation states
- `js/calculators.js` — loan calculator, savings calculator, indicative currency converter
- `js/translator.js` + `languages/fr.json` + `languages/en.json` — FR/EN toggle (French primary)
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

## Phase 2 (not started)

Account-application backend (secure ID upload handling, admin review/approve dashboard),
contact-form delivery, real rates/fees, real branch data, real WhatsApp number.
