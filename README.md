# Brandovise CRM Console

A small web app that gets a broker's customer/contract spreadsheets into Zoho
CRM, and gives the team one screen to work renewals from — built for the
Brandovise CRM & Automation Developer assessment.

Stack: **Next.js (App Router, TypeScript) + Tailwind CSS**, **PapaParse** for
CSV parsing, **Zod-style hand validation** for data quality, native `fetch`
for all Zoho CRM API calls. No database — Zoho CRM *is* the database.

---

## 1. Running it locally

```bash
npm install
cp .env.example .env.local   # fill in your Zoho values, see section 2
npm run dev
```

Open `http://localhost:3000`. Two pages matter:

- `/import` — upload the two CSVs (or use the copies already checked into
  `data/`), preview what will happen, confirm, and write to Zoho.
- `/contracts` — the console the broker's team actually works from.

No `.env.local`? The app still boots and the import **preview** works (it
only parses CSVs), but anything that talks to Zoho — commit, the console,
follow-ups — will fail with a clear "missing environment variable" error
until you configure it.

---

## 2. Zoho setup

### 2.1 OAuth: how the app authenticates, and where secrets live

- The app uses a **Server-based Application** OAuth client (Zoho API
  Console → `api-console.zoho.com`), which is the type meant for a
  confidential backend — as opposed to a client-side/JS client, which would
  force the secret into the browser.
- Scopes needed: `ZohoCRM.modules.ALL`, `ZohoCRM.settings.ALL`,
  `ZohoCRM.users.READ`.
- You do the OAuth consent grant **once**, by hand, to obtain a
  **refresh token** (Zoho's "Generate Code" flow in the API console, then
  exchange the resulting grant code for tokens). From then on the server
  exchanges that refresh token for short-lived access tokens itself —
  no browser redirect flow is part of the running app.
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN` live only
  in server-side environment variables (`.env.local` locally, project
  environment variables on the host in production). They are read exclusively
  by [`src/lib/zoho/token.ts`](src/lib/zoho/token.ts) and
  [`src/lib/zoho/client.ts`](src/lib/zoho/client.ts), both of which run only
  in Next.js Route Handlers (`src/app/api/**/route.ts`, `runtime = "nodejs"`).
  Nothing under `src/app/**/page.tsx` (the client components) ever imports
  those modules, and no secret is embedded in any `NEXT_PUBLIC_*` variable —
  so none of it can reach the browser bundle.
- `.env*` is git-ignored (see `.gitignore`); only `.env.example` (no real
  values) is committed.
- The access token is cached in memory per server process and refreshed
  ~1 minute before it expires, or immediately on a 401 from the API
  (`invalidateAccessToken`), so normal operation never round-trips to
  `accounts.zoho.*` on every request.

### 2.2 Data centre

Your API base URL and OAuth token URL must match the data centre your Zoho
account was created in. Set both in `.env.local`:

| Data centre | `ZOHO_ACCOUNTS_URL` | `ZOHO_API_DOMAIN` |
|---|---|---|
| US | `https://accounts.zoho.com` | `https://www.zohoapis.com` |
| EU | `https://accounts.zoho.eu` | `https://www.zohoapis.eu` |
| IN | `https://accounts.zoho.in` | `https://www.zohoapis.in` |

### 2.3 Modelling Contacts and Contracts

**Customers → standard `Contacts` module.** A customer in this dataset is a
person with a name, address and date of birth — exactly what `Contacts` is
for out of the box, and it's what every other Zoho feature (mail merge,
activities, the standard UI) already expects. Building a custom "Kunden"
module would just re-implement `Contacts` for no benefit. Two custom fields
are added:

- `Kundennummer` (Single Line, **marked unique**) — the external key from
  the source system. This is what makes the import idempotent (§4).
- `Makler` (Single Line) — the responsible agent's name, kept as plain text
  rather than a lookup to a Zoho user, because a 30-day trial org typically
  only has one real user account (the signer), so there's nothing meaningful
  to look up against for the other three brokers in the sample data. See
  §5 for how this is used for task assignment.

**Contracts → custom module `Vertraege`.** This is not something `Deals`
(opportunities) models well — a contract here is a signed, ongoing policy,
not a sales pipeline stage — so it gets its own module. Fields:

| Field (API name) | Type | Notes |
|---|---|---|
| `Name` | Single Line (the module's primary field) | holds the contract number; labelled "Vertragsnummer" in the Zoho UI. Zoho enforces primary-field uniqueness, which is what drives upsert idempotency. |
| `Kontakt` | **Lookup → Contacts** | see §2.4 |
| `Produkt` | Single Line | e.g. "Berufsunfähigkeit" |
| `Versicherer` | Single Line | e.g. "Nürnberger" |
| `Beginn` | Date | |
| `Ende` | Date | expiry date; drives the console's urgency sort |
| `Jahresbeitrag` | Currency | parsed from German `1.234,56` format |
| `Zahlweise` | Single Line | jährlich/halbjährlich/vierteljährlich/monatlich |
| `Status` | Single Line | Aktiv/Gekündigt/In Bearbeitung |
| `Makler` | Single Line | copied from the linked contact at import time |
| `Follow_up_Erstellt` | **Checkbox**, default unchecked | "has a renewal follow-up already been created" — the field the brief asks for |

You can create the module/fields via the Zoho UI (Setup → Modules and
Fields) or the Metadata API — the app doesn't care, it only needs the API
names above to exist before you run an import. `ZOHO_CONTRACT_MODULE_API_NAME`
in `.env` lets you point at a differently-named module without touching code.

### 2.4 Linking contracts to customers

`Vertraege.Kontakt` is a genuine **Lookup field to Contacts**, not a copied
name — set once, on import, using the Zoho record ID returned when the
matching contact was created/updated (`src/lib/zoho/mappings.ts`,
`contractToZohoRecord`). Because it's a real lookup, opening a customer in
Zoho shows their contracts in the related list for free, and the console can
resolve full contact details for every contract via that same ID
(`src/app/api/contracts/route.ts`).

---

## 3. What's wrong with the CSVs, and what I decided

The brief is explicit that finding these is part of the task; detection is
implemented in [`src/lib/csv/parse.ts`](src/lib/csv/parse.ts) and surfaced
to a non-technical user in the import preview, not just noted here.

| # | Issue | Where | Decision |
|---|---|---|---|
| 1 | `Geburtsdatum`/`Ablaufdatum` mix two date formats: ISO (`2019-10-15`) almost everywhere, but German `DD.MM.YYYY` on customer K‑1024's birth date and on contract `VN-2020-1477`'s expiry date | both files | Parse both formats explicitly (`parseFlexibleDate`), normalize to ISO for storage, and **flag** every row where the non-standard format was used so it's visible, even though it was handled automatically. |
| 2 | `Jahresbeitrag` uses German decimal commas (`1284,00`) | vertraege | Parse with `parseGermanDecimal` before sending to Zoho's `Currency` field, which expects a plain number. |
| 3 | Customer K‑1017 (Elena Hartmann) has no email | kontakte | Not fatal — imported without email, **flagged as a warning** so a human can chase it up. Refusing the whole row for one missing field felt disproportionate; refusing to *guess* an email did not. |
| 4 | K‑1023 (Doris Frank) and K‑1024 (Doris Frank-Berger) share the same email and phone number, a near-identical address (`Hammer Straße 108` vs `Hammer Str. 108`), and the same birth date in two different formats — but different `Kundennummer`. Reads like the same person recorded twice, possibly after a name change | kontakte | **Conservative choice, per the brief's steer**: both are imported as separate contacts (their `Kundennummer` values are genuinely different, so silently dropping one risks losing a real, distinct customer), but flagged clearly as a likely duplicate for a human to merge. An automated merge would be guessing at business facts (which name is current, which contracts belong where) that only the broker actually knows. |
| 5 | Contract `VN-2020-0805` references customer `K-1099`, who does not exist anywhere in `kontakte_export.csv` | vertraege | **Refused, not imported.** There's no defensible way to link this contract to a customer, and creating it unlinked would violate the brief's own requirement ("linked to its customer... use a lookup relationship"). Flagged as an error requiring a human decision (typo in the customer number, or a genuinely missing customer record). |
| 6 | Contract `VN-2021-0417` (customer K‑1001) appears **twice**, byte-for-byte identical, on row 2 and row 54 | vertraege | Deduplicated on `Vertragsnummer`: first occurrence imported, the repeat skipped and flagged, rather than relying on Zoho's upsert to quietly collapse it (the report explicitly says a duplicate row was found, instead of staying silent). |
| 7 | Inconsistent street abbreviations (`Straße` vs `Str.`) and phone-number spacing | kontakte | Left as-is. This is cosmetic, not a data-integrity problem, and normalizing address abbreviations algorithmically risks introducing errors of its own (e.g. `Str.` isn't always `Straße`). Noted here rather than silently "fixed". |
| 8 | `Status = "Gekündigt"` (cancelled) contracts are still present in the export | vertraege | Imported like any other contract (the data itself isn't wrong), but the console excludes cancelled contracts from the "create a follow-up" action and gives them a neutral/greyed treatment instead of an urgency colour — calling a customer about a policy they already cancelled is the kind of thing that damages trust. |

Both row counts match the brief exactly: 30 customer rows, 53 contract rows
— i.e. every row above is accounted for, nothing was silently dropped
outside of this table.

---

## 4. Running the import more than once

**Zoho's native upsert** (`POST /crm/{v}/{module}/upsert` with
`duplicate_check_fields`) is used for both modules, keyed on `Kundennummer`
for `Contacts` and `Name` (the contract number, labelled "Vertragsnummer" in
the Zoho UI — see §2.3) for `Vertraege`
(`src/lib/zoho/client.ts::upsertRecords`). Zoho matches on that field
server-side and turns a repeat import into an **update**, not a second
insert — this is enforced by Zoho itself, not by client-side "have I seen
this before" bookkeeping that could drift out of sync with what's actually
in the CRM.

One deliberate exception: `Follow_up_Erstellt` is **never** included in the
upsert payload for contracts (see the comment in
`src/lib/zoho/mappings.ts::contractToZohoRecord`). If it were, re-running the
import would reset every contract's flag back to unchecked and silently
erase the fact that a follow-up task already exists — the one field the
brief specifically asks the console, not the importer, to own. It is only
ever written by the follow-up endpoint.

The import preview also does its own pass to catch problems *before* they
reach Zoho at all — duplicate rows and duplicate customer numbers within a
single file are deduplicated client-import-side too (§3), so what actually
gets sent to the upsert call is already the deduplicated set.

---

## 5. The write path: creating a renewal follow-up

`POST /api/contracts/[id]/followup` (`src/app/api/contracts/[id]/followup/route.ts`)
does the two writes the brief asks for, in order, and fails loudly rather
than swallowing errors:

1. **Create a Task** in Zoho: subject `Renewal call — <Nachname>, <Vorname> (<Vertragsnummer>)`,
   `Due_Date` = expiry date minus 30 days, `Who_Id` linked to the customer,
   `What_Id` linked to the contract record (`$se_module` set to the custom
   module so Zoho resolves the polymorphic lookup correctly). If a Zoho user
   exists whose full name matches the contract's `Makler`, the task's
   `Owner` is set to them; if not (very likely on a fresh trial org with a
   single user), the task is still created — just unassigned — and the UI
   is told why via `ownerNote`, instead of pretending the assignment
   happened.
2. **Only if the task write succeeded**, update the contract's
   `Follow_up_Erstellt` to `true`. If this second write fails, the response
   says so explicitly (including the task ID that *was* created) rather than
   reporting a generic success — so a real Zoho-side failure is never
   invisible to the person using the console.

The console (`src/app/contracts/page.tsx`) updates its local state from the
API response directly — no `router.refresh()`, no full reload — so the row's
"follow-up created" badge and the disabled button reflect Zoho's actual new
state immediately.

---

## 6. The contract console

`/contracts` (`src/app/contracts/page.tsx` + `src/app/api/contracts/route.ts`):

- Lists every contract with the linked customer's name, email and phone
  (resolved via the `Kontakt` lookup's Zoho ID, batch-fetched from `Contacts`).
- Filters by **Makler** (dropdown, derived from what's actually in the data)
  and by **expiry window** (30 / 90 / 180 days / all), combinable.
- Urgency is colour-coded by days-to-expiry (red ≤30d, amber ≤90d, yellow
  ≤180d, neutral beyond, dark red if already expired), with cancelled
  contracts shown neutrally instead of urgently — a cancelled policy isn't
  "urgent", it's irrelevant.
- Contracts already followed-up show a green badge; others show "none yet"
  and get the "Create follow-up" button (hidden once used, or for cancelled
  contracts).

---

## 7. Security

- Zoho client secret and refresh token are read only by server-side modules
  under `src/lib/zoho/*`, called only from Route Handlers. See §2.1 for the
  exact boundary and why the browser never sees them.
- `.env*` is git-ignored; only `.env.example` (empty placeholders) is
  committed.
- No Zoho credentials are logged; API errors surfaced to the client carry
  Zoho's error `code`/`message`, not the request that produced them.

---

## 8. Deployment

Any Node-friendly free tier works (Vercel, Render, Railway, Fly.io). For
Vercel:

```bash
npm i -g vercel
vercel
vercel env add ZOHO_ACCOUNTS_URL production
vercel env add ZOHO_API_DOMAIN production
vercel env add ZOHO_CLIENT_ID production
vercel env add ZOHO_CLIENT_SECRET production
vercel env add ZOHO_REFRESH_TOKEN production
vercel --prod
```

Set the same variables for the `preview`/`development` environments if you
want import/console pages to work on preview deploys too.

---

## 9. What I'd do differently with more time

- **Real Makler → Zoho user mapping**, with a proper admin screen instead of
  a name-string match, once there's an org with more than one real user to
  test it against.
- **A `duplicate_of` lookup** on `Contacts`, set automatically when the
  email-collision check (issue #4 in §3) fires, so the likely-duplicate pair
  is linked in Zoho itself rather than only flagged in the import report.
- **Optimistic-locking on the follow-up write**: right now a double-click
  race on "Create follow-up" is only prevented by disabling the button
  client-side; a server-side check-then-set on `Follow_up_Erstellt` would
  close that gap properly.
- **COQL-based contract listing** instead of list-then-batch-fetch-contacts,
  to cut the console's Zoho API calls from two round trips to one as the
  contract count grows past what fits in a couple of `per_page=200` pages.
- The optional extras from the brief (bulk 30-day follow-up creation, an
  LLM-generated German talking point, a per-Makler overview, editing an
  existing contract) — none attempted, in favour of getting the required
  four parts solid first.
