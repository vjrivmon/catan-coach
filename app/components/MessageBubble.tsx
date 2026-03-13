import ReactMarkdown from 'react-markdown'
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
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none
            prose-p:my-1 prose-p:leading-relaxed
            prose-strong:text-amber-300 prose-strong:font-semibold
            prose-ul:my-1 prose-ul:pl-4 prose-ul:space-y-0.5
            prose-ol:my-1 prose-ol:pl-4 prose-ol:space-y-0.5
            prose-li:my-0
            prose-headings:text-amber-300 prose-headings:font-semibold prose-headings:my-2
          ">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}
