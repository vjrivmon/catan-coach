import type { Message } from '@/src/domain/entities'

interface Props {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-amber-600 text-white rounded-br-sm'
            : 'bg-stone-700 text-stone-100 rounded-bl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}
