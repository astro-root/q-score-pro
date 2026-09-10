export function GlowBackdrop({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #6957e0 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #ffc247 0%, transparent 70%)" }}
      />
    </div>
  );
}
