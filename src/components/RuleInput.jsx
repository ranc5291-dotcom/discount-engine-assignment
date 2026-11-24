import { useState } from 'react'
import { findDuplicateRule } from '../inputs/validateRule.js'

const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
]

const fmtValue = (r) => (r.type === 'percentage' ? `${r.value}%` : `Rs.${r.value}`)

export default function RuleInput({ apiUrl, knownBrands, knownPlatforms, existingRules = [], onAddRule }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState(null) // { rule, warnings }
  const [problem, setProblem] = useState(null) // { kind, lines }

  function reset() {
    setParsed(null)
    setProblem(null)
  }

  async function handleParse(e) {
    e.preventDefault()
    if (!text.trim() || loading) return
    reset()
    setLoading(true)

    try {
      const res = await fetch(`${apiUrl}/api/parse-rule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, knownBrands, knownPlatforms }),
      })
      const data = await res.json().catch(() => ({}))

      if (data.status === 'ok') setParsed({ rule: data.rule, warnings: data.warnings || [] })
      else if (data.status === 'ambiguous')
        setProblem({
          kind: 'ambiguous',
          lines: [data.message || 'Please be more specific: include the discount value and who it applies to.'],
        })
      else if (data.status === 'invalid') setProblem({ kind: 'invalid', lines: data.errors })
      else setProblem({ kind: 'error', lines: [data.message || data.error || 'Could not parse the rule.'] })
    } catch {
      setProblem({ kind: 'error', lines: ['Cannot reach the server. Is the backend running?'] })
    } finally {
      setLoading(false)
    }
  }

  const r = parsed?.rule
  // Same offer already active? Then adding it again would change nothing.
  const duplicate = parsed ? findDuplicateRule(parsed.rule, existingRules) : null

  function confirm() {
    if (duplicate) return
    onAddRule(parsed.rule)
    setText('')
    reset()
  }

  return (
    <div>
      <form onSubmit={handleParse} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "20% off for Natura Casa brand, stackable"'
          maxLength={300}
          aria-label="Describe a discount rule"
          style={{ flex: '1 1 260px', padding: 12, border: '1px solid #ccc', borderRadius: 4, fontSize: 13, outlineColor: '#FF5800' }}
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          style={{
            background: '#FF5800', color: '#fff', border: 0, borderRadius: 4,
            padding: '0 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: loading || !text.trim() ? 0.5 : 1,
          }}
        >
          {loading ? 'Parsing…' : 'Parse rule'}
        </button>
      </form>

      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setText(ex)}
            style={{ border: '1px solid #dedee5', background: '#f7f7f9', borderRadius: 999, padding: '4px 10px', fontSize: 11, color: '#131A48', cursor: 'pointer' }}
          >
            {ex}
          </button>
        ))}
      </div>

      {problem && (
        <div
          role="alert"
          style={{
            marginTop: 10, padding: 10, borderRadius: 6, fontSize: 12,
            background: problem.kind === 'ambiguous' ? '#fff8e6' : '#fff0ef',
            color: problem.kind === 'ambiguous' ? '#8a5a00' : '#b42318',
          }}
        >
          <strong>
  {problem.kind === 'ambiguous'
    ? "I couldn't turn that into a rule: "
    : problem.kind === 'invalid'
      ? 'Rule rejected: '
      : 'Something went wrong: '}
</strong>
          {problem.lines.join(' ')}
        </div>
      )}

      {parsed && (
        <div style={{ marginTop: 12, border: '1px solid #131A48', borderRadius: 8, padding: 14, background: '#fafbff' }}>
          <div style={{ fontWeight: 700, color: '#131A48', fontSize: 13, marginBottom: 8 }}>
            Please confirm this rule
          </div>
          <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              <Field k="Scope" v={r.scope[0].toUpperCase() + r.scope.slice(1)} />
              {r.scope !== 'cart' && <Field k="Applies to" v={r.appliesTo} />}
              <Field k="Type" v={r.type[0].toUpperCase() + r.type.slice(1)} />
              <Field k="Value" v={fmtValue(r)} />
              <Field k="Stackable" v={r.stackable ? 'Yes' : 'No'} />
              {r.scope === 'cart' && (
                <Field k="Min cart value" v={`Rs.${Number(r.minCartValue).toLocaleString('en-IN')}`} />
              )}
            </tbody>
          </table>

          {parsed.warnings.map((w, i) => (
            <div key={i} style={{ marginTop: 8, fontSize: 12, color: '#8a5a00', background: '#fff8e6', padding: 8, borderRadius: 6 }}>
              ⚠ {w}
            </div>
          ))}

          {duplicate && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#b42318', background: '#fff0ef', padding: 8, borderRadius: 6 }}>
              This is the same as {duplicate.ruleId}, which is already active. Adding it again would change nothing.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={confirm}
              disabled={Boolean(duplicate)}
              style={{
                background: '#1e5c2c', color: '#fff', border: 0, borderRadius: 4, padding: '9px 18px',
                fontWeight: 700, cursor: duplicate ? 'not-allowed' : 'pointer', opacity: duplicate ? 0.5 : 1,
              }}
            >
              Confirm &amp; add
            </button>
            <button onClick={reset} style={{ background: '#fff', color: '#b42318', border: '1px solid #b42318', borderRadius: 4, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ k, v }) {
  return (
    <tr>
      <td style={{ padding: '3px 16px 3px 0', color: '#666' }}>{k}</td>
      <td style={{ padding: '3px 0', fontWeight: 600, color: '#131A48' }}>{v}</td>
    </tr>
  )
}