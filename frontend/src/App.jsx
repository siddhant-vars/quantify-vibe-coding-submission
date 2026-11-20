import { useEffect, useRef, useState } from 'react'
import * as api from './api'
import Sidebar from './components/Sidebar'
import Message from './components/Message'
import ToneToggle from './components/ToneToggle'

const STARTERS = [
  'Explain how database indexes work with a small example',
  'Draft a polite email asking a client for a deadline extension',
  'Give me a 3-day study plan for learning React hooks',
]

export default function App() {
  const [convos, setConvos] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [tone, setTone] = useState(() => localStorage.getItem('tone') || 'professional')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [navOpen, setNavOpen] = useState(false)

  const activeRef = useRef(null)
  const queryRef = useRef('')
  const abortRef = useRef(null)
  const queueRef = useRef('')   // text received but not yet "typed" on screen
  const doneRef = useRef(true)  // network stream finished
  const timerRef = useRef(null)
  const bottomRef = useRef(null)

  queryRef.current = query
  const setActive = (id) => { activeRef.current = id; setActiveId(id) }
  const refresh = () =>
    api.listConversations(queryRef.current).then(setConvos).catch(() => setError('Cannot reach the server. Is the backend running on port 8000?'))

  useEffect(() => {
    const t = setTimeout(refresh, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

  const appendToLast = (text) =>
    setMessages((m) => {
      const c = [...m]
      c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + text }
      return c
    })

  // Ends the typing animation: reveal anything still queued, unlock the UI.
  const finish = () => {
    clearInterval(timerRef.current)
    const rest = queueRef.current
    queueRef.current = ''
    if (rest) appendToLast(rest)
    setMessages((m) => {
      const last = m[m.length - 1]
      if (last?.streaming && !last.content && !rest) return m.slice(0, -1) // nothing arrived
      return m.map((x, i) => (i === m.length - 1 ? { ...x, streaming: false } : x))
    })
    setBusy(false)
    refresh()
  }

  const stop = () => { abortRef.current?.abort(); finish() }

  async function send(text, regenerate = false) {
    if (busy || (!regenerate && !text.trim())) return
    setError('')
    setBusy(true)
    setMessages((m) => {
      const base = regenerate && m.at(-1)?.role === 'assistant' ? m.slice(0, -1) : m
      const user = regenerate ? [] : [{ role: 'user', content: text.trim(), timestamp: new Date().toISOString() }]
      return [...base, ...user, { role: 'assistant', content: '', streaming: true, tone }]
    })

    // Smooth, character-by-character reveal. Speeds up if the network gets ahead.
    queueRef.current = ''
    doneRef.current = false
    timerRef.current = setInterval(() => {
      const q = queueRef.current
      if (q) {
        const n = Math.max(1, Math.ceil(q.length / 12))
        queueRef.current = q.slice(n)
        appendToLast(q.slice(0, n))
      } else if (doneRef.current) finish()
    }, 18)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await api.streamChat(
        { conversation_id: activeRef.current, message: regenerate ? null : text.trim(), tone, regenerate },
        { onMeta: setActive, onDelta: (t) => { queueRef.current += t }, onError: setError },
        ctrl.signal,
      )
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Something went wrong. Try again.')
    }
    doneRef.current = true
  }

  const submit = () => {
    const text = input
    if (!text.trim() || busy) return
    setInput('')
    send(text)
  }

  const open = async (id) => {
    if (busy) stop()
    try {
      const c = await api.getConversation(id)
      setActive(id)
      setMessages(c.messages)
      setNavOpen(false)
      setError('')
    } catch (e) { setError(e.message) }
  }

  const newChat = () => { if (busy) stop(); setActive(null); setMessages([]); setNavOpen(false); setError('') }

  const remove = async (id) => {
    if (!window.confirm('Delete this conversation?')) return
    await api.deleteConversation(id)
    if (id === activeRef.current) newChat()
    refresh()
  }

  const changeTone = (t) => { setTone(t); localStorage.setItem('tone', t) }
  const lastAi = messages.findLastIndex((m) => m.role === 'assistant')

  return (
    <div className="app">
      <Sidebar items={convos} activeId={activeId} query={query} onQuery={setQuery}
               onOpen={open} onNew={newChat} onDelete={remove} open={navOpen} />
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <main className="main">
        <header className="top">
          <button className="menu" onClick={() => setNavOpen(true)} aria-label="Open history">History</button>
          <ToneToggle value={tone} onChange={changeTone} />
          {activeId && <a className="export" href={api.exportUrl(activeId)}>Export</a>}
        </header>

        <section className="feed" aria-live="polite">
          {messages.length === 0 ? (
            <div className="hero">
              <h1>What are we working on?</h1>
              <p>Pick a tone above, then ask anything. Replies stream in live and are saved to your history.</p>
              <div className="starters">
                {STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          ) : (
            <div className="thread-col">
              {messages.map((m, i) => (
                <Message key={i} m={m}
                  onRegenerate={!busy && i === lastAi && m.content ? () => send('', true) : undefined} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </section>

        {error && <div className="error" role="alert">{error}</div>}

        <footer className="composer">
          <textarea
            rows={1}
            value={input}
            placeholder="Message the assistant"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            aria-label="Message"
          />
          {busy
            ? <button className="send stop" onClick={stop}>Stop</button>
            : <button className="send" onClick={submit} disabled={!input.trim()}>Send</button>}
        </footer>
      </main>
    </div>
  )
}
