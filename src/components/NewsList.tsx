"use client";

import { formatRelativeTime } from "@/lib/format";
import { useNews, type NewsScope } from "@/hooks/use-news";

/**
 * Compact headlines for a scope, newest first, where votes are not wanted
 * (the asset card, the pre-IPO company card). Each row is an outbound
 * link; the source and age sit under the headline so a reader can judge
 * it before clicking. `limit` keeps embedded lists short.
 */
export function NewsList({
  scope,
  limit,
  emptyText = "No recent coverage.",
}: {
  scope: NewsScope;
  limit?: number;
  emptyText?: string;
}) {
  const { items, isLoaded, error } = useNews(scope);
  const visible = limit ? items.slice(0, limit) : items;

  if (!isLoaded) {
    return (
      <ul className="space-y-2" aria-busy="true">
        {Array.from({ length: Math.min(limit ?? 3, 3) }, (_, i) => (
          <li key={i} className="skeleton h-10 rounded-[var(--radius-control)]" />
        ))}
      </ul>
    );
  }
  if (error) return <p className="text-xs text-muted">{error}</p>;
  if (visible.length === 0) return <p className="text-xs text-muted">{emptyText}</p>;

  return (
    <ul className="divide-y divide-line-soft">
      {visible.map((item) => (
        <li key={item.id}>
          <a href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 py-2.5 transition-colors hover:bg-hover active:opacity-70">
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized thumbnails from many hosts
              <img
                src={item.image}
                alt=""
                loading="lazy"
                onError={(e) => {
                  // Many publishers block hotlinking; drop the box rather than show a broken frame.
                  e.currentTarget.style.display = "none";
                }}
                className="h-12 w-16 shrink-0 rounded-[var(--radius-control)] border border-line bg-inset object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] font-semibold leading-snug text-fg">{item.headline}</p>
              <p className="mt-1 text-[10px] text-muted">
                <span className="font-mono">{item.source}</span> · {formatRelativeTime(item.publishedAt)}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
