import type { ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for notebook markdown cells —
 * headers, bold/italic, inline code, and lists. Not a full CommonMark
 * implementation (no tables, links, images, nested blocks); good enough
 * for typical notebook prose. Renders to React nodes directly rather than
 * dangerouslySetInnerHTML.
 */
export function TinyMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-0.5 pl-5">
        {listItems.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, i) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"];
      blocks.push(
        <p key={i} className={`${sizes[level - 1]} font-semibold`}>
          {inline(heading[2])}
        </p>
      );
      return;
    }
    const listItem = /^[-*]\s+(.*)$/.exec(line);
    if (listItem) {
      listItems.push(listItem[1]);
      return;
    }
    flushList();
    if (line.trim() === "") {
      blocks.push(<div key={i} className="h-2" />);
      return;
    }
    blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flushList();

  return <div className="space-y-1 text-sm leading-relaxed">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key++} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
