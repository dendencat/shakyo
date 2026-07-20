import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ alt }) => <span>{alt || '画像'}</span>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
