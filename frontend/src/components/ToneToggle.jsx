const TONES = [
  { id: 'professional', label: 'Professional', hint: 'Polished and precise' },
  { id: 'casual', label: 'Casual', hint: 'Relaxed and friendly' },
  { id: 'concise', label: 'Concise', hint: 'Short, answer first' },
]

export default function ToneToggle({ value, onChange }) {
  return (
    <div className="tone" role="radiogroup" aria-label="Response tone">
      {TONES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={value === t.id}
          className={value === t.id ? 'on' : ''}
          title={t.hint}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
