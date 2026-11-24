Opptra Discount Engine

A customer-facing cart pricing engine. It applies brand, platform and cart-level discounts, always giving the customer the biggest saving, and explains each offer in plain language.

Live demo: https://discount-engine-assignment-taupe.vercel.app
Backend (API): https://discount-engine-assignment-cu5s.onrender.com
Walkthrough (Loom, recorded on the live site): <PASTE_LOOM_URL_HERE>

The backend runs on a free tier and sleeps when idle. The first plain-English rule or chat message after a pause can take 30 to 60 seconds while it wakes up. Opening /api/health on the backend URL wakes it.

Run locally (3 steps)
bash
# 1. Install
git clone https://github.com/ranc5291-dotcom/discount-engine-assignment.git
cd discount-engine-assignment && npm install

# 2. Add your Groq key
cp .env.example .env          # then set GROQ_API_KEY in .env

# 3. Start the frontend and the backend (two terminals)
npm run dev                   # http://localhost:5173
npm run server                # http://localhost:3001

On Windows PowerShell, use copy .env.example .env for step 2.

CSV upload, PDF upload, item-level discounts and the cart offer run entirely in the browser. Only the plain-English rule box and the Opptra chat assistant need the backend.

Run the tests with npm test (Node's built-in test runner, no extra dependencies). Sample files are in sample-data/.

Environment variables
Variable	Where	Purpose
GROQ_API_KEY	backend	LLM access. Never sent to the browser.
FRONTEND_ORIGIN	backend	Allowed CORS origin (default http://localhost:5173). No trailing slash.
PORT	backend	Server port (default 3001).
VITE_API_URL	frontend build	Backend URL (default http://localhost:3001).
What was built
Part	What it does
Base engine	Brand and platform rules per item. Of the non-stackable rules that match, the one with the largest rupee saving wins. Stackable rules apply on top. No match gives the base price and "No offers available".
Task 1: Cart offer	After item-level discounts, the item subtotal is checked against each cart rule's minimum (≥). If met, the percentage is applied to the whole cart and shown as its own row ("Cart offer: 10% off, Rs.593 saved"). Below the threshold the row is hidden and a hint shows how much more is needed.
Task 2: Plain-English rules	Text is parsed by an LLM into a DiscountRule, validated, and shown in a confirmation card. The user confirms or discards. On confirm the engine re-runs with the new rule.
Task 3: PDF cart upload	A text-based PDF table (Product, Brand, Platform, Base Price) is converted into cart items and replaces the current cart. The engine re-runs with the existing rules.
Opptra chat (extra)	A small assistant that explains the cart. See "Chat assistant" below.

Verified against the brief's expected results: ITEM-01 Rs.1,104, ITEM-02 Rs.629, ITEM-03 Rs.509, ITEM-04 Rs.2,499 (no offer), ITEM-05 Rs.382, ITEM-06 Rs.809, subtotal Rs.5,932, cart offer Rs.593, final Rs.5,339.

Code structure
server.mjs              Express entry point (wires the routes below)
server/                 Backend: llm.js and prompts.js (the only code that talks to the LLM),
                        routes/parseRule.js and routes/chat.js
src/engine/             Discount engine, CSV parsing and cart analysis. Knows nothing about inputs.
src/inputs/             Input paths that PRODUCE rules or cart items:
                          validateRule.js (plain-English rules),
                          pdfCartParser.js and parseCartLines.js (PDF carts)
src/chat/replies.js     Deterministic chat answers built from engine output
src/components/         UI (uploaders, rule box, tables, chat)
src/utils/cartHint.js   "Add Rs.X more to unlock a cart offer" calculation
tests/                  Engine, parsers, validation, chat replies, server routes
sample-data/            Sample rules and cart CSVs

The engine was not changed to fit the new inputs. CSV, PDF and plain-English input each only produce CartItem[] or DiscountRule[]. A fourth input mode (for example an API or a spreadsheet) needs a new file in src/inputs/ and one handler in App.jsx, with no change to discountEngine.js.

Design decisions and tradeoffs
Discount logic
Rounding. Each discount step is rounded to the nearest whole rupee. This matches every figure in the brief. On other carts a result can differ by Rs.1 from unrounded maths (for example 50% then 10% on Rs.899 gives Rs.404, exact value 404.55).
Stacking order. The winning non-stackable rule applies first, then each stackable rule is applied on the reduced price, as in the brief's ITEM-02 example. For example, adding a stackable 20% Natura Casa rule turns ITEM-02 into Rs.849, minus Rs.150, minus 10%, minus 20%, giving Rs.503.
Prices never go negative. A flat discount larger than the price results in Rs.0.
Cart threshold is inclusive (≥). Tests cover 3,999 (no), 4,000 (yes) and 4,001 (yes). Cart rules are checked against the sum of final item prices, as the brief specifies.
Several cart rules. The non-stackable cart rule with the larger saving wins and the other is recorded as skipped. Stackable cart rules apply on top.
Explanations are generated by the engine, not the LLM, so after a new rule or a new cart the "offer applied" text always matches the numbers.
Plain-English rules (LLM)
The LLM output is never trusted. validateRule.js rejects invalid scope or type, non-positive values, percentages over 100, and missing targets.
Grounding check. If the value or minimum returned by the LLM does not appear in the user's text, the confirmation card shows a warning.
Known names. The brand or platform is matched against what is in the current cart and uses the cart's spelling. An unknown name is allowed but warned about. A platform name used as a brand (or the reverse) is rejected.
Duplicates. If an identical rule is already active, the card says so and disables Confirm.
Stackable defaults to No unless the text explicitly says it can combine with other offers.
Ambiguous input such as "Give a discount for big orders" is shown as unresolvable, with a request for a value and a target. It does not crash and nothing is added.
"More than Rs.5,000" is stored as a minimum of Rs.5,000 and evaluated with ≥, the same as every cart rule in the brief. A cart of exactly Rs.5,000 would therefore qualify. A strict ">" would need an operator field on the rule, which changes the rule model and the engine, so this is a documented simplification.
Failures are visible, not silent. Unreadable LLM output, a service error and an unreachable server each show a clear message.
PDF cart upload
Format assumption. Text-based PDFs with a header row containing Product, Brand, Platform and Base Price. Columns are located from the header's positions, with a gap-based fallback.
No header row means rejection. The parser does not guess columns.
Malformed rows (bad price, missing cell) are skipped and reported by row number. Valid rows are still imported.
Zero valid rows leaves the current cart untouched.
Order and date lines above the header, separator lines, footer totals and repeated headers on later pages are ignored. Prices are accepted as Rs.1,299, ₹1299 or INR 1299; paise are rounded to whole rupees.
Items are renumbered ITEM-01… in file order.
Limitation: scanned or image PDFs are not supported and show a clear error. Alternative I would propose: accept a CSV or structured export from the order system, or add OCR as a separate input mode.
Why there is a backend

The brief says a backend is optional, and PDF parsing here is client-side. The server exists only so the Groq API key is never exposed in the browser. It stores nothing: all cart and rule state is in memory for the session.

Chat assistant

Every number comes from the engine, not from the model. Questions about the highest or lowest discount, the best platform, the cart offer, "explain the rules" and what-ifs ("what if I remove ITEM-06?") are answered deterministically from engine output. Other questions go to the LLM with the engine's results as the only source of truth, and replies that leak internal field names are detected and replaced. What-ifs run on a copy, so the real cart is never changed. The chat resets when the rules or the cart change, so it never answers from stale data.

Where I would disagree with the brief
The confirmation step is right for safety, but I added a duplicate-rule check so a user cannot confirm a rule that changes nothing.
The PDF format is brittle for real-world documents. For production I would prefer structured order data over parsing a PDF layout.
Tests

npm test runs the Node test runner over:

the engine (spec results, thresholds, ties, negative-price protection, case-insensitive matching)
CSV and PDF parsing (bad rows, headers, footers)
rule validation (the brief's three examples, invalid values, duplicates)
the chat replies and the server routes with the LLM stubbed (ok, ambiguous, invalid, unreadable output, service down)
Deployment
Frontend (Vercel): build command npm run build, output folder dist, environment variable VITE_API_URL=<backend URL> (set before the build).
Backend (Render): build command npm install, start command npm run server, environment variables GROQ_API_KEY and FRONTEND_ORIGIN=<frontend URL>.