import { InvestorPanel } from "@/components/people/InvestorPanel";

/** One wallet: a static profile panel with holdings from the chain and the fills it made through Solera. */
export default async function InvestorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvestorPanel id={id} />;
}
