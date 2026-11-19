/**
 * ペーパークイズのプレート(番号札)の色。
 * 大会で使う札の色は主催者ごとに違うので自由な #RRGGBB を許し、
 * 選びやすいよう定番の色をパレットとして用意する。
 * DB側にも同じ形式の CHECK がある (0014: plate_color ~ '^#[0-9a-fA-F]{6}$')。
 */
export const PLATE_PALETTE = [
  { name: "赤", hex: "#dc2626" },
  { name: "橙", hex: "#ea580c" },
  { name: "黄", hex: "#facc15" },
  { name: "緑", hex: "#16a34a" },
  { name: "水", hex: "#06b6d4" },
  { name: "青", hex: "#2563eb" },
  { name: "紫", hex: "#7c3aed" },
  { name: "桃", hex: "#ec4899" },
  { name: "白", hex: "#ffffff" },
  { name: "黒", hex: "#111827" },
] as const;

const PLATE_RE = /^#[0-9a-fA-F]{6}$/;

export function isPlateColor(value: unknown): value is string {
  return typeof value === "string" && PLATE_RE.test(value);
}

/** 保存用に小文字へ正規化する (#FFAA00 と #ffaa00 を同じ色として扱う)。 */
export function normalizePlateColor(value: string): string {
  return value.toLowerCase();
}

/** 色の名前(パレットにあれば)。CSV 出力で使う。なければ #rrggbb をそのまま返す。 */
export function plateColorLabel(hex: string | null): string {
  if (!hex) return "";
  const found = PLATE_PALETTE.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  return found ? found.name : hex.toLowerCase();
}

/** 背景色に対して読める文字色 (WCAG の相対輝度で判定)。 */
export function plateTextColor(hex: string): "#111827" | "#ffffff" {
  if (!PLATE_RE.test(hex)) return "#111827";
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.4 ? "#111827" : "#ffffff";
}
