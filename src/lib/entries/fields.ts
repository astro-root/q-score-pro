/**
 * エントリーフォームの項目編集(純粋関数)。
 * 項目キーは回答(entries.answers)のJSONキーそのものなので、後から変えると過去の回答と
 * 結びつかなくなる。主催者に英数字のキーを考えさせない(自動採番)が、既存の項目の
 * キーは変えない、という方針をここに集約する。
 */
export const FIELD_KEY_PATTERN = /^[a-z0-9_]+$/;

export interface FieldDraftLike {
  fieldKey: string;
  label: string;
  fieldType: string;
  optionsText: string;
}

/** field_1, field_2, ... の中で、まだ使われていない最小の番号のキー。 */
export function nextFieldKey(existingKeys: readonly string[]): string {
  const used = new Set(existingKeys);
  for (let i = 1; ; i++) {
    const key = `field_${i}`;
    if (!used.has(key)) return key;
  }
}

/** 配列の要素を上下に動かした新しい配列。範囲外なら同じ内容のコピー。 */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  const copy = [...items];
  if (index < 0 || index >= copy.length || to < 0 || to >= copy.length) return copy;
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

export function parseOptions(text: string): string[] {
  return text
    .split(/[,、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 項目ごとの入力エラー(index -> メッセージ)。空なら保存してよい。 */
export function validateFieldDrafts(drafts: readonly FieldDraftLike[]): Map<number, string> {
  const errors = new Map<number, string>();
  const seen = new Map<string, number>();
  drafts.forEach((d, i) => {
    if (!d.label.trim()) {
      errors.set(i, "表示ラベルを入力してください");
      return;
    }
    if (!FIELD_KEY_PATTERN.test(d.fieldKey) || d.fieldKey.length > 64) {
      errors.set(i, "項目キーは半角英小文字・数字・アンダースコアのみ(64文字まで)");
      return;
    }
    const first = seen.get(d.fieldKey);
    if (first !== undefined) {
      errors.set(i, `項目キーが ${first + 1} 番目の項目と重複しています`);
      return;
    }
    seen.set(d.fieldKey, i);
    if (d.fieldType === "SELECT" && parseOptions(d.optionsText).length === 0) {
      errors.set(i, "選択式には選択肢を1つ以上入力してください");
    }
  });
  return errors;
}
