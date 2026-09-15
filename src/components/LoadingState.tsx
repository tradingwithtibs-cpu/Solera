export function LoadingState() {
  return (
    <div role="status" aria-label="Loading your saved data" className="space-y-5 p-6">
      <span className="text-sm text-neutral-500">Loading your saved data…</span>
      <div className="h-36 rounded-3xl bg-neutral-100" />
      <div className="h-20 rounded-2xl bg-neutral-100" />
      <div className="h-20 rounded-2xl bg-neutral-100" />
    </div>
  );
}
