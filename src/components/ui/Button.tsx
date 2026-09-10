import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)] hover:-translate-y-px",
  secondary:
    "bg-surface text-ink border border-border hover:border-border-strong hover:bg-surface-muted",
  ghost: "text-body hover:bg-surface-muted",
  danger: "bg-surface text-danger border border-danger/30 hover:bg-danger-soft",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link href={href} className={`${BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
