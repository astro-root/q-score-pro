import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return n.value;
      case "bold":
        return <strong key={i} className="font-semibold text-ink">{n.value}</strong>;
      case "code":
        return <code key={i} className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]">{n.value}</code>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2 hover:text-primary-hover">
            {n.value}
          </a>
        );
    }
  });
}

/** 大会ページの本文。HTMLは出力せず、React 要素だけを組み立てる(XSS を構造的に防ぐ)。 */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-body">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 1 ? (
              <h3 key={i} className="mt-2 text-base font-bold text-ink">{renderInline(b.content)}</h3>
            ) : (
              <h4 key={i} className="mt-1 text-sm font-bold text-ink">{renderInline(b.content)}</h4>
            );
          case "paragraph":
            return (
              <p key={i}>
                {b.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {renderInline(line)}
                  </span>
                ))}
              </p>
            );
          case "list": {
            const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>);
            return b.ordered ? (
              <ol key={i} className="list-decimal pl-5">{items}</ol>
            ) : (
              <ul key={i} className="list-disc pl-5">{items}</ul>
            );
          }
          case "rule":
            return <hr key={i} className="border-border" />;
        }
      })}
    </div>
  );
}
