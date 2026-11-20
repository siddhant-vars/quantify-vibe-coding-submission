const day = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function Sidebar({ items, activeId, query, onQuery, onOpen, onNew, onDelete, open }) {
  return (
    <aside className={`side ${open ? 'open' : ''}`}>
      <button className="new" onClick={onNew}>New chat</button>
      <input
        className="search"
        type="search"
        placeholder="Search conversations"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-label="Search conversations"
      />
      <nav className="threads" aria-label="Conversation history">
        {items.length === 0 && (
          <p className="empty">{query ? 'No conversations match.' : 'Your conversations will appear here.'}</p>
        )}
        {items.map((c) => (
          <div key={c.id} className={`thread ${c.id === activeId ? 'active' : ''}`}>
            <button className="open-thread" onClick={() => onOpen(c.id)}>
              <span className="t-title">{c.title}</span>
              <span className="t-date">{day(c.updated_at)}</span>
            </button>
            <button className="del" aria-label={`Delete ${c.title}`} onClick={() => onDelete(c.id)}>×</button>
          </div>
        ))}
      </nav>
    </aside>
  )
}
