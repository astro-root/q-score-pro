/**
 * 表示レイアウトに書ける画像URLの判定 (D-05)。
 *
 * 許可するのは http(s) のURLと、サイト内のパス("/images/a.png" のような / 始まり)だけ。
 * "javascript:" や "data:" などは使えない。引用符・括弧・空白・バックスラッシュ・<> を
 * 含むものも拒否する(CSS の url(...) や HTML に埋め込まれるため)。
 * 外部から取り込んだレイアウトでも、描画側でも同じ判定を使う。
 */
const SAFE_URL = /^(?:https?:\/\/|\/(?!\/))[^\s"'()\\<>]+$/;

export function isSafeImageUrl(value: string): boolean {
  return value.length <= 2000 && SAFE_URL.test(value);
}
