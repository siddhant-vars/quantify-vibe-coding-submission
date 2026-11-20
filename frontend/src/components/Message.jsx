import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function Pre({ children }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="code">
      <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}

export default function Message({ m, onRegenerate }) {
  const [copied, setCopied] = useState(false)
  const isUser = m.role === 'user'
  const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const copy = async () => {
    await navigator.clipboard.writeText(m.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`row ${isUser ? 'user' : 'ai'}`}>
      <div className={`bubble ${m.streaming ? 'streaming' : ''}`}>
        {isUser ? (
          <p className="plain">{m.content}</p>
        ) : m.content ? (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: Pre }}>{m.content}</ReactMarkdown>
          </div>
        ) : (
          <span className="dots" aria-label="Assistant is thinking"><i /><i /><i /></span>
        )}
      </div>
      {!m.streaming && (
        <div className="meta">
          <span>{time}</span>
          {!isUser && m.tone && <span className="chip">{m.tone}</span>}
          {!isUser && <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>}
          {onRegenerate && <button onClick={onRegenerate}>Regenerate</button>}
        </div>
      )}
    </div>
  )
}
