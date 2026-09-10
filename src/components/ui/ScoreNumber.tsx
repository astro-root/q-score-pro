export function ScoreNumber({
  value,
  size = "md",
  tone = "accent",
}: {
  value: string | number;
  size?: "sm" | "md" | "lg";
  tone?: "accent" | "ink" | "muted";
}) {
  const sizeClass = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }[size];
  const toneClass = { accent: "text-accent", ink: "text-ink", muted: "text-muted" }[tone];
  return <span className={`font-score ${sizeClass} ${toneClass}`}>{value}</span>;
}
