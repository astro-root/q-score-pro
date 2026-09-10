import type { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="text-sm font-medium text-body" {...props} />;
}

const FIELD_BASE =
  "rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_BASE} ${className}`} {...props} />;
}
