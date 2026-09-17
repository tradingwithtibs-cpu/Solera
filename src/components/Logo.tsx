export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight text-neutral-900 ${className}`}>
      Solera
    </span>
  );
}
