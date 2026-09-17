import { MY_PROFILE } from "@/lib/mock-data";
import { FeedList } from "@/components/FeedList";
import { WelcomeGuide } from "@/components/WelcomeGuide";
import { NewsList } from "@/components/NewsList";
import Link from "next/link";
export default function FeedPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <h1>
          Solera<span className="text-violet-500">.</span>
        </h1>
        <p>Welcome, {MY_PROFILE.name.split(" ")[0]}.</p>
      </header>
      <WelcomeGuide />
      <section className="mx-5 mb-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:mx-7">
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
