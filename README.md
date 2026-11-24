# Opptra Discount Engine

A customer-facing cart pricing engine. It applies brand, platform and cart-level discounts, always gives the customer the biggest saving, and explains each offer in plain language.

| **Live demo** | https://discount-engine-assignment-taupe.vercel.app |
| **Backend (API)** | https://discount-engine-assignment-cu5s.onrender.com |
| **Repository** | https://github.com/ranc5291-dotcom/discount-engine-assignment |

> **Heads-up:** the backend runs on a free tier and sleeps when idle. The first plain-English rule or chat message after a pause can take 30 to 60 seconds. Opening [`/api/health`](https://discount-engine-assignment-cu5s.onrender.com/api/health) wakes it.

---

## Run locally (2 steps)

**1. Clone, install and add your Groq key**

```bash
git clone https://github.com/ranc5291-dotcom/discount-engine-assignment.git
cd discount-engine-assignment
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
# then open .env and set GROQ_API_KEY
```

**2. Start the frontend and the backend (two terminals)**

```bash
npm run dev       # frontend: http://localhost:5173
npm run server    # backend:  http://localhost:3001
```

CSV upload, PDF upload, item-level discounts and the cart offer run entirely in the browser. Only the plain-English rule box and the chat assistant need the backend. Sample files are in `sample-data/`. Run the tests with `npm test`.

---

## Features

| Feature | What it does |
|---|---|
| **Base engine** | Brand and platform rules per item. Among non-stackable rules the largest rupee saving wins; stackable rules apply on top. No match returns the base price with "No offers available". |
| **Cart-level offer** | After item discounts, the sum of final item prices is checked against each cart rule's minimum (≥). If met, the percentage comes off the whole cart as its own row ("Cart offer: 10% off — Rs.593 saved"). Below the threshold the row is hidden and a hint shows how much more is needed. |
| **Plain-English rules** | An LLM turns text into a `DiscountRule`. The result is validated and shown on a confirmation card. The user confirms or discards, then the engine re-runs. |
| **PDF cart upload** | Reads a Product / Brand / Platform / Base Price table, replaces the cart and re-runs the engine with the existing rules. |
| **Chat assistant** (extra) | Explains the cart. Every number comes from the engine, not the model. |

---

## Verified results

The sample CSVs give exactly the brief's expected output:

| Item | Base | Final | Applied |
|---|---:|---:|---|
| ITEM-01 | Rs.1,299 | **Rs.1,104** | Platform 15% beats Brand Rs.150 |
| ITEM-02 | Rs.849 | **Rs.629** | Brand Rs.150 + stackable Platform 10% |
| ITEM-03 | Rs.599 | **Rs.509** | Platform 15% |
| ITEM-04 | Rs.2,499 | **Rs.2,499** | No offers available |
| ITEM-05 | Rs.449 | **Rs.382** | Platform 15% |
| ITEM-06 | Rs.899 | **Rs.809** | Platform 10% |
| **Subtotal** | | **Rs.5,932** | |
| **Cart offer** (≥ Rs.4,000) | | **−Rs.593** | 10% off |
| **Final total** | | **Rs.5,339** | |

Also checked on the live site: a bad-row PDF (bad rows skipped and reported, good rows kept), a cart just below the threshold (no cart row, hint shown), all three plain-English examples from the brief, an ambiguous rule, a rejected invalid rule (200% off), a duplicate rule, and an unreachable backend.

---

## Code structure

```
server.mjs            Express entry point (wires the routes)
server/               llm.js, prompts.js (the only code that talks to the LLM)
                      routes/parseRule.js, routes/chat.js
src/engine/           Discount engine, CSV parsing, cart analysis. Knows nothing about inputs.
src/inputs/           Input paths that PRODUCE rules or cart items:
                        validateRule.js          plain-English rules
                        pdfCartParser.js, parseCartLines.js   PDF carts
src/chat/replies.js   Deterministic chat answers built from engine output
src/components/       UI (uploaders, rule box, tables, chat)
src/utils/cartHint.js "Add Rs.X more to unlock a cart offer"
tests/                Engine, parsers, validation, chat replies, server routes
sample-data/          Sample rules and cart CSVs
```

**The engine was not changed to fit the new inputs.** CSV, PDF and plain-English input each only produce `CartItem[]` or `DiscountRule[]`. A new input mode needs one new file in `src/inputs/` and one handler in `App.jsx`, with no change to `discountEngine.js`.

---

## Design decisions

### Discount logic
- **Rounding:** each discount step is rounded to the nearest rupee. This matches every figure in the brief. On other carts a result can differ by Rs.1 from unrounded maths (50% then 10% on Rs.899 gives Rs.404; the exact value is 404.55).
- **Stacking order:** the winning non-stackable rule applies first, then each stackable rule on the reduced price, as in the brief's ITEM-02 example.
- **No negative prices:** a flat discount larger than the price results in Rs.0.
- **Inclusive threshold (≥):** tests cover 3,999 (no offer), 4,000 and 4,001 (offer). The check uses the sum of *final item prices*, as the brief specifies.
- **Several cart rules:** the non-stackable cart rule with the larger saving wins and the other is recorded as skipped.
- **Explanations come from the engine, not the LLM**, so the "offer applied" text always matches the numbers after a new rule or cart.

### Plain-English rules (LLM)
- **Output is never trusted.** `validateRule.js` rejects bad scope or type, non-positive values, percentages over 100 and missing targets.
- **Grounding check:** if the value or minimum is not found in the user's text, the confirmation card shows a warning.
- **Known names:** brands and platforms are matched against the current cart and use the cart's spelling. An unknown name is allowed with a warning. A platform name used as a brand (or the reverse) is rejected.
- **Duplicates:** an identical active rule is flagged and Confirm is disabled.
- **Stackable defaults to No** unless the text explicitly says it can combine with other offers.
- **Ambiguous input** ("Give a discount for big orders") is shown as unresolvable and nothing is added.
- **"More than Rs.5,000"** is stored as a minimum of Rs.5,000 and evaluated with ≥, like every cart rule in the brief, so exactly Rs.5,000 would qualify. A strict ">" needs an operator on the rule model, which would change the engine, so this is a documented simplification.
- **Failures are visible:** unreadable LLM output, a service error and an unreachable server each show a clear message.

### PDF cart upload
- **Format assumption:** a text-based table with a header row (Product, Brand, Platform, Base Price). Columns are found from the header's positions, with a gap-based fallback.
- **No header row means rejection.** The parser does not guess columns.
- **Malformed rows** (bad price, missing cell) are skipped and reported by row number; valid rows are still imported.
- **Zero valid rows** leaves the current cart untouched.
- Order and date lines, separators, footer totals and repeated headers are ignored. Prices may be `Rs.1,299`, `₹1299` or `INR 1299`; paise are rounded to whole rupees. Items are renumbered `ITEM-01…` in file order.

### Why there is a backend
The brief says a backend is optional, and PDF parsing here is client-side. The server exists only so the Groq API key never reaches the browser. It stores nothing: all cart and rule state lives in memory for the session.

### Chat assistant
Questions about the highest or lowest discount, the best platform, the cart offer, "explain the rules" and what-ifs ("what if I remove ITEM-06?") are answered deterministically from engine output. Other questions go to the LLM with the engine's results as its only source of truth, and replies that leak internal field names are detected and replaced. What-ifs run on a copy, so the real cart never changes. The chat resets when the rules or cart change.

---

## Testing

```bash
npm test         # Node's built-in test runner, no extra dependencies
npm run build    # Vite production build
```

- **49 of 49 tests pass.** They cover the engine (spec results, thresholds, ties, negative-price protection, case-insensitive matching), CSV and PDF parsing, rule validation (the brief's examples, invalid values, duplicates), chat replies, and the server routes with the LLM stubbed (ok, ambiguous, invalid, unreadable output, service down).
- **The production build succeeds** (297 modules, no errors).


---

## Deployment

| Part | Host | Settings |
|---|---|---|
| Frontend | Vercel | Build `npm run build`, output `dist`, env `VITE_API_URL=<backend URL>` (set before the build) |
| Backend | Render | Build `npm install`, start `npm run server`, env `GROQ_API_KEY` and `FRONTEND_ORIGIN=<frontend URL>` (no trailing slash) |

| Variable | Where | Purpose |
|---|---|---|
| `GROQ_API_KEY` | backend | LLM access. Never sent to the browser. |
| `FRONTEND_ORIGIN` | backend | Allowed CORS origin (default `http://localhost:5173`) |
| `PORT` | backend | Server port (default 3001) |
| `VITE_API_URL` | frontend build | Backend URL (default `http://localhost:3001`) |
