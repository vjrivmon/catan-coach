interface Props {
  suggestions: string[]
  onSelect: (question: string) => void
}

export function SuggestionChips({ suggestions, onSelect }: Props) {
  if (!suggestions.length) return null

  return (
    <div className="flex flex-wrap gap-2 pl-1 pt-1">
      {suggestions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className="text-xs text-amber-300 bg-stone-800 border border-amber-700/50 rounded-full px-3 py-1.5 hover:bg-stone-700 hover:border-amber-500 transition-colors text-left leading-snug"
        >
          {q}
        </button>
      ))}
    </div>
  )
}
