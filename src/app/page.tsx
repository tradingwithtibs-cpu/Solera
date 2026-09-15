import { MY_PROFILE } from "@/lib/mock-data";
import { FeedList } from "@/components/FeedList";
import { WelcomeGuide } from "@/components/WelcomeGuide";
export default function FeedPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <h1>
          Stocklana<span className="text-violet-500">.</span>
        </h1>
        <p>Welcome, {MY_PROFILE.name.split(" ")[0]}.</p>
      </header>
      <WelcomeGuide />
      <FeedList />
    </div>
  );
}
