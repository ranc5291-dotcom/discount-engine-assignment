/**
 * App.jsx
 * Opptra Discount Engine
 *  - CSV / PDF cart input, CSV / natural-language rule input
 *  - Item-level + cart-level discounts (engine in ./engine)
 *  - Floating Opptra AI assistant
 *
 * Input modes (CSV, PDF, plain-English rule) only produce rules / cart items.
 * The engine is never modified to accommodate them.
 */

import { useMemo, useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import RuleInput from './components/RuleInput.jsx'
import PdfUploader from './components/PdfUploader.jsx'
import OpptraChat from './components/OpptraChat.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { processCart, cartTotal } from './engine/discountEngine.js'
import { cartOfferGap } from './utils/cartHint.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const inr = (n) => `Rs.${Number(n).toLocaleString('en-IN')}`

function nextRuleId(rules) {
  const max = rules.reduce((m, r) => {
    const n = Number(String(r.ruleId).replace(/\D/g, ''))
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `RULE-${String(max + 1).padStart(2, '0')}`
}

// ── Column definitions ───────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID' },
  { key: 'scope', label: 'Scope', render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  { key: 'appliesTo', label: 'Applies To', render: (v, row) => (row.scope === 'cart' ? 'Entire cart' : v) },
  { key: 'type', label: 'Type', render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => {
      const base = row.type === 'percentage' ? `${v}% off` : `${inr(v)} off`
      return row.scope === 'cart' ? `${base} (min ${inr(row.minCartValue)})` : base
    },
  },
  { key: 'stackable', label: 'Stackable', render: (v) => (v ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => inr(v) },
]

const RESULTS_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price', render: (v) => inr(v) },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>{inr(v)}</span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? <span style={{ color: '#1e5c2c', fontWeight: 600 }}>{inr(v)}</span> : <span style={{ color: '#888' }}>—</span>,
  },
   {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v, row) => (
      <>
        <span style={{ color: v === 'No offers available' ? '#888' : '#131A48', fontStyle: v === 'No offers available' ? 'italic' : 'normal' }}>
          {v}
        </span>
        {row.explanation && (
          <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{row.explanation}</div>
        )}
      </>
    ),
  },
]

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page: { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header: { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan: { color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main: { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem 6rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.2rem' },
  btn: { background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4, padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' },
  btnDisabled: { background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4, padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'not-allowed', letterSpacing: '0.04em', textTransform: 'uppercase' },
  totals: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '2px solid #131A48', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
}

function TotalRow({ label, value, color = '#131A48', big }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <span style={{ fontWeight: 700, fontSize: 14, color }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: big ? 18 : 16, color }}>{value}</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErr] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')

  // Once the user has calculated, results stay in sync with rules/cart automatically.
  const [hasCalculated, setHasCalculated] = useState(false)
  // Bumped whenever rules/cart change so the chat drops stale answers.
  const [dataVersion, setDataVersion] = useState(0)
  const bump = () => setDataVersion((v) => v + 1)

  const canCalculate = rules.length > 0 && cartItems.length > 0

  const results = useMemo(
    () => (hasCalculated && canCalculate ? processCart(cartItems, rules) : null),
    [hasCalculated, canCalculate, cartItems, rules]
  )

  const knownBrands = useMemo(() => [...new Set(cartItems.map((i) => i.brand))], [cartItems])
  const knownPlatforms = useMemo(() => [...new Set(cartItems.map((i) => i.platform))], [cartItems])

  // ── Input handlers (each only produces rules / cart items) ────

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    setHasCalculated(false)
    bump()
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setHasCalculated(false)
    bump()
  }

  // PDF: replaces the cart and the engine re-runs with the existing rules.
  // If nothing valid was extracted, the current cart is left untouched.
  function handlePdfLoad({ data, errors }, fileName) {
    setCartErrors(errors)
    if (data.length === 0) return
    setCartItems(data)
    setCartFileName(fileName)
    setHasCalculated(true)
    bump()
  }

  // Natural-language rule: already validated + user-confirmed in <RuleInput />.
  function handleAddRule(rule) {
    setRules((prev) => [...prev, { ...rule, ruleId: nextRuleId(prev) }])
    setHasCalculated(true)
    bump()
  }

  const cartGap = results ? cartOfferGap(results.cartSubtotal, rules) : null

  // ── Render ───────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.logoTxt}>
          O<span style={S.logoSpan}>pp</span>tra
        </div>
        <div style={S.headerSub}>Discount Engine</div>
      </header>

      <main style={S.main}>
        <div style={S.grid2}>
          {/* Discount Rules */}
          <section style={{ ...S.section, marginBottom: 0 }}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </section>

          {/* Cart Items */}
          <section style={{ ...S.section, marginBottom: 0 }}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartItems.length > 0}
              fileName={cartFileName}
            />
            <PdfUploader onParsed={handlePdfLoad} />
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </section>
        </div>

        {/* Natural-language rule */}
        <section style={S.section}>
          <div style={S.sectionTitle}>Add a Rule in Plain English</div>
                    <RuleInput
            apiUrl={API_URL}
            knownBrands={knownBrands}
            knownPlatforms={knownPlatforms}
            existingRules={rules}
            onAddRule={handleAddRule}
          />
        </section>

        {/* Calculate */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={() => {
              setHasCalculated(true)
              bump()
            }}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Upload both files to calculate</div>
          )}
        </div>

        {/* Results */}
        {results && (
          <section style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results} />

            <div style={S.totals}>
              <TotalRow label="Item-level Subtotal" value={inr(results.cartSubtotal)} />

              {results.cartDiscount > 0 && (
                <TotalRow
                  label={`${results.cartDiscountDetails.reasoning} — ${inr(results.cartDiscount)} saved`}
                  value={`-${inr(results.cartDiscount)}`}
                  color="#1e5c2c"
                />
              )}

              {results.cartDiscount === 0 && cartGap && (
                <div style={{ fontSize: 12, color: '#8a5a00', background: '#fff8e6', padding: '6px 10px', borderRadius: 6 }}>
                  Add {inr(cartGap.needed)} more (after item discounts) to unlock a cart offer
                  (minimum {inr(cartGap.rule.minCartValue)}).
                </div>
              )}

              <TotalRow label="Final Cart Total" value={inr(cartTotal(results))} big />
            </div>
          </section>
        )}
      </main>

      {results && (
        <OpptraChat apiUrl={API_URL} rules={rules} cartItems={cartItems} resetKey={dataVersion} />
      )}
    </div>
  )
}