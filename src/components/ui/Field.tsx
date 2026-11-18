import type { ReactNode } from "react";
import { Label } from "@/components/ui/Input";

/**
 * Label + control + hint/error, wired for accessibility (htmlFor, aria-describedby
 * is left to the caller's control id). Keeps every form's spacing and error
 * presentation identical.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Inline form-level message (error / success), used under a form's fields. */
export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "border-danger/30 bg-danger-soft text-danger"
      : "border-success/30 bg-success-soft text-success";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}
