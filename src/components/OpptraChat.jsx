import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const mdComponents = {
  p: (p) => <p style={{ margin: '6px 0' }} {...p} />,
  h1: (p) => <h1 style={{ fontSize: 18, color: '#131A48', margin: '10px 0 6px' }} {...p} />,
  h2: (p) => <h2 style={{ fontSize: 16, color: '#131A48', margin: '10px 0 6px' }} {...p} />,
  h3: (p) => <h3 style={{ fontSize: 14, color: '#131A48', margin: '10px 0 5px' }} {...p} />,
  ul: (p) => <ul style={{ paddingLeft: 20, margin: '6px 0' }} {...p} />,
  ol: (p) => <ol style={{ paddingLeft: 20, margin: '6px 0' }} {...p} />,
  li: (p) => <li style={{ margin: '3px 0' }} {...p} />,
  table: (p) => (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '10px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, background: '#fff' }} {...p} />
    </div>
  ),
  th: (p) => <th style={{ border: '1px solid #ddd', padding: 7, background: '#f0f1f5', color: '#131A48', textAlign: 'left', whiteSpace: 'nowrap' }} {...p} />,
  td: (p) => <td style={{ border: '1px solid #ddd', padding: 7, verticalAlign: 'top' }} {...p} />,
  blockquote: (p) => <blockquote style={{ margin: '8px 0', padding: '2px 12px', borderLeft: '3px solid #FF5800', color: '#555' }} {...p} />,
  hr: () => <hr style={{ border: 0, borderTop: '1px solid #ddd', margin: '10px 0' }} />,
}

export default function OpptraChat({ apiUrl, rules, cartItems, resetKey }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  // Cart or rules changed -> old answers are stale, start fresh.
  useEffect(() => {
    setMessages([])
    setError('')
  }, [resetKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const removeId = cartItems[cartItems.length - 1]?.itemId || 'ITEM-01'
  const suggestions = [
    'Which product has the highest discount?',
    'How much did I save overall?',
    'Which platform saves me the most?',
    'Explain the cart-level offer',
    `What if I remove ${removeId}?`,
  ]

  async function send(text) {
    const message = text.trim()
    if (!message || loading) return

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context: { rules, cartItems } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'AI request failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Cannot reach the Opptra assistant. Is the backend running?'
          : err.message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes opptra-pop { from { opacity:0; transform: translateY(14px) scale(.97) } to { opacity:1; transform:none } }
        .opptra-panel{position:fixed;right:24px;bottom:92px;z-index:1000;width:min(430px,calc(100vw - 32px));height:min(650px,calc(100vh - 125px));display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid #dedee5;border-radius:16px;box-shadow:0 12px 45px rgba(19,26,72,.22);animation:opptra-pop .2s ease-out}
        .opptra-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 17px;color:#fff;background:#131A48;flex-shrink:0}
        .opptra-body{flex:1;min-height:0;overflow-y:auto;padding:16px;background:#f7f7f9}
        .opptra-chips{display:flex;gap:6px;overflow-x:auto;padding:8px 12px 0;background:#fff;flex-shrink:0}
        .opptra-chip{white-space:nowrap;border:1px solid #dedee5;background:#f7f7f9;color:#131A48;border-radius:999px;padding:6px 11px;font-size:12px;cursor:pointer}
        .opptra-chip:hover{border-color:#FF5800}
        .opptra-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e5e9;background:#fff;flex-shrink:0}
        .opptra-input{flex:1;min-width:0;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:14px;outline-color:#FF5800}
        .opptra-launcher{position:fixed;right:24px;bottom:22px;z-index:1001;display:flex;align-items:center;gap:9px;border:0;border-radius:999px;padding:14px 20px;color:#fff;background:#131A48;box-shadow:0 6px 22px rgba(19,26,72,.25);font-size:15px;font-weight:700;cursor:pointer}
        .opptra-close{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;color:#fff;background:rgba(255,255,255,.14);font-size:23px;line-height:1;cursor:pointer}
        @media (max-width:600px){
          .opptra-panel{left:0;right:0;bottom:0;width:100%;height:92dvh;max-height:92dvh;border-radius:18px 18px 0 0}
          .opptra-launcher{right:16px;bottom:16px;padding:13px 18px}
          .opptra-input{font-size:16px}
        }
        @media (prefers-reduced-motion:reduce){.opptra-panel{animation:none}}
      `}</style>

      {open && (
        <section className="opptra-panel" role="dialog" aria-label="Opptra AI chat">
          <div className="opptra-head">
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Opptra</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>Your shopping assistant</div>
            </div>
            <button type="button" className="opptra-close" onClick={() => setOpen(false)} aria-label="Close Opptra chat" title="Close">
              ×
            </button>
          </div>

          <div className="opptra-body" aria-live="polite">
            {messages.length === 0 && (
              <div style={{ maxWidth: '94%', padding: '13px 15px', border: '1px solid #e2e2e8', borderRadius: '4px 14px 14px 14px', background: '#fff', fontSize: 13, lineHeight: 1.65, color: '#252525' }}>
                <strong style={{ color: '#131A48', fontSize: 14 }}>Hi! I'm Opptra 👋</strong>
                <p style={{ margin: '7px 0' }}>
                  I'm your shopping assistant. I can explain your discounts, compare savings across platforms
                  and brands, and show what-if changes to your cart. Pick an option below or ask me anything.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="opptra-chip" style={{ textAlign: 'left', whiteSpace: 'normal' }} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                <div
                  style={{
                    maxWidth: '92%', padding: '10px 13px', borderRadius: 10, fontSize: 13, lineHeight: 1.6,
                    overflowWrap: 'anywhere',
                    background: msg.role === 'user' ? '#131A48' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#222',
                    border: msg.role === 'assistant' ? '1px solid #ddd' : 'none',
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 10, marginBottom: 5, opacity: 0.7 }}>
                    {msg.role === 'user' ? 'YOU' : 'OPPTRA'}
                  </strong>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {loading && <div style={{ fontSize: 12, color: '#777', padding: 8 }}>Opptra is thinking…</div>}
            <div ref={endRef} />
          </div>

          {error && (
            <div role="alert" style={{ color: '#b42318', fontSize: 12, margin: '8px 12px 0', padding: 9, background: '#fff0ef', borderRadius: 6 }}>
              {error}
            </div>
          )}

          {messages.length > 0 && (
            <div className="opptra-chips">
              {suggestions.map((s) => (
                <button key={s} type="button" className="opptra-chip" disabled={loading} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="opptra-form"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            <input
              className="opptra-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Opptra…"
              disabled={loading}
              aria-label="Message Opptra"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{ background: '#FF5800', color: '#fff', border: 0, borderRadius: 8, padding: '0 17px', fontWeight: 700, cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}
            >
              {loading ? '…' : 'Send'}
            </button>
          </form>
        </section>
      )}

      <button type="button" className="opptra-launcher" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close Opptra chat' : 'Open Opptra chat'}>
        <span aria-hidden="true">✦</span> Opptra
      </button>
    </>
  )
}