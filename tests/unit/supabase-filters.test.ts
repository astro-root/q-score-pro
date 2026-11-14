import { describe, expect, it } from "vitest";
import {
  buildEntrySearchFilter,
  escapeLikePattern,
  quotePostgrestValue,
} from "@/lib/supabase/filters";

describe("PostgREST フィルタの安全な組み立て (R-10)", () => {
  it("LIKE のワイルドカードとバックスラッシュをエスケープする", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("値をダブルクォートで囲み、中の \" と \\ をエスケープする", () => {
    expect(quotePostgrestValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("通常の検索語", () => {
    expect(buildEntrySearchFilter("山田")).toBe(
      'display_name.ilike."%山田%",email.ilike."%山田%",affiliation.ilike."%山田%"'
    );
  });

  it("カンマ・括弧を含む検索語でも、フィルタ構文の区切りにならない(3条件のまま)", () => {
    const filter = buildEntrySearchFilter("東京大学,クイズ研究会(第2)");
    // 引用符の外側にあるカンマ(=条件の区切り)はちょうど2つ
    const outsideQuotes = filter.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(outsideQuotes.split(",")).toHaveLength(3);
    expect(filter).toContain('"%東京大学,クイズ研究会(第2)%"');
  });

  it("ダブルクォートを含む検索語でも引用が閉じない", () => {
    const filter = buildEntrySearchFilter('a" ,email.eq.x');
    const outsideQuotes = filter.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(outsideQuotes).toBe('display_name.ilike."",email.ilike."",affiliation.ilike.""');
  });
});
