import Link from "next/link";
import { FeedList } from "@/components/FeedList";
import { Hero } from "@/components/Hero";
import { NewsList } from "@/components/NewsList";

export default function FeedPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Hero />
      <section className="mx-5 mb-4 rounded-2xl border border-neutral-200 bg-panel p-4 sm:mx-7">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Today in markets</h2>
          <Link href="/news" className="text-xs font-semibold text-violet-600">
            All news →
          </Link>
        </div>
        <NewsList scope={{ kind: "general" }} limit={4} />
      </section>
      <FeedList />
    </div>
  );
}
