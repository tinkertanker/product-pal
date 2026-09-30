import ReactMarkdown from 'react-markdown';

/** Coach output as markdown. react-markdown ignores raw HTML by default. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
