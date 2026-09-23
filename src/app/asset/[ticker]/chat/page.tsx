import { RoomPage } from "@/components/rooms/RoomPage";

/** The room for one tokenized stock, full width: the phone route and the deep link. */
export default async function AssetChatPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return <RoomPage ticker={ticker} />;
}
