"use client";

import { formatRelativeTime } from "@/lib/format";
import { useNews, type NewsScope } from "@/hooks/use-news";

/**
 * Headlines for a scope, newest first. Each row is an outbound link; the
 * source and age sit under the headline so a reader can judge it before
 * clicking. `limit` keeps embedded lists short; the /news page shows all.
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
      <ul className="space-y-3" aria-busy="true">
        {Array.from({ length: Math.min(limit ?? 3, 3) }, (_, i) => (
          <li key={i} className="h-10 animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </ul>
    );
  }
  if (error) return <p className="text-xs text-neutral-400">{error}</p>;
  if (visible.length === 0) return <p className="text-xs text-neutral-400">{emptyText}</p>;

  return (
    <ul className="divide-y divide-neutral-100">
      {visible.map((item) => (
        <li key={item.id}>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 py-3 active:opacity-70"
          >
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized thumbnails from many hosts
              <img
                src={item.image}
                alt=""
                loading="lazy"
                onError={(e) => {
                  // Many publishers block hotlinking; drop the box rather than show a gray square.
                  e.currentTarget.style.display = "none";
                }}
                className="h-12 w-16 shrink-0 rounded-lg bg-neutral-100 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-neutral-900">{item.headline}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {item.source} · {formatRelativeTime(item.publishedAt)}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
