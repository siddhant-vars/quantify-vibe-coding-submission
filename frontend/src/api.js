const json = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Request failed (${res.status})`)
  return res.json()
}

export const listConversations = (q = '') => fetch(`/api/conversations?q=${encodeURIComponent(q)}`).then(json)
export const getConversation = (id) => fetch(`/api/conversations/${id}`).then(json)
export const deleteConversation = (id) => fetch(`/api/conversations/${id}`, { method: 'DELETE' }).then(json)
export const exportUrl = (id) => `/api/conversations/${id}/export`

/** POST + read the Server-Sent-Events stream (EventSource can't POST). */
export async function streamChat(body, { onMeta, onDelta, onError }, signal) {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Request failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()
    for (const raw of events) {
      if (!raw.startsWith('data: ')) continue
      const ev = JSON.parse(raw.slice(6))
      if (ev.type === 'meta') onMeta?.(ev.conversation_id)
      else if (ev.type === 'delta') onDelta?.(ev.text)
      else if (ev.type === 'error') onError?.(ev.message)
    }
  }
}
