/**
 * 大会ページ用の最小限の Markdown パーサー(依存なし・HTMLは一切通さない)。
 *
 * 対応: 見出し(# ## ###)、段落(行末の改行は <br>)、箇条書き(- / * / 1.)、区切り線(---)、
 *       **太字**、`コード`、[リンク](https://...)。
 * 安全性: パース結果は AST で、描画側が React 要素として出力する(dangerouslySetInnerHTML を使わない)。
 *       書かれた HTML タグはただの文字として表示される。リンクは http / https / mailto のみ許可し、
 *       javascript: や data: は文字のまま(リンクにしない)。
 */
export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; href: string; value: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "rule" };

const SAFE_HREF = /^(https?:\/\/|mailto:)[^\s]+$/i;

export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href);
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: "text", value: text.slice(last, index) });
    const token = m[0];
    if (token.startsWith("**")) {
      out.push({ type: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      out.push({ type: "code", value: token.slice(1, -1) });
    } else {
      const close = token.indexOf("](");
      const label = token.slice(1, close);
      const href = token.slice(close + 2, -1);
      // 危険なURLはリンクにせず、書かれたとおりの文字として残す
      out.push(isSafeHref(href) ? { type: "link", href, value: label } : { type: "text", value: token });
    }
    last = index + token.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return mergeText(out);
}

/** 隣り合うテキストを1つにまとめる(危険なリンクを文字に戻したときなどに分かれるため)。 */
function mergeText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const n of nodes) {
    const prev = merged[merged.length - 1];
    if (n.type === "text" && prev?.type === "text") prev.value += n.value;
    else merged.push(n);
  }
  return merged;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraph.map(parseInline) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, content: parseInline(heading[2]) });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
