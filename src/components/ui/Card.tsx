import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  glass = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={`rounded-2xl border shadow-[var(--shadow-card)] ${
        glass ? "glass" : "border-border bg-surface"
      } ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-b border-border px-5 py-4 ${className}`} {...props} />;
}

export function CardBody({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-5 ${className}`} {...props} />;
}
