import type { InvestorSocials } from "@/lib/types";
import { DiscordIcon, InstagramIcon, XIcon } from "./icons";

const PLATFORMS = [
  { key: "x", Icon: XIcon, urlFor: (handle: string) => `https://x.com/${handle}` },
  { key: "instagram", Icon: InstagramIcon, urlFor: (handle: string) => `https://instagram.com/${handle}` },
  { key: "discord", Icon: DiscordIcon, urlFor: (handle: string) => `https://discord.com/users/${handle}` },
] as const;

/** Small row of icon links to an investor's linked social profiles, when they have any. */
export function SocialLinks({ socials }: { socials?: InvestorSocials }) {
  if (!socials) return null;

  const entries = PLATFORMS.filter(({ key }) => socials[key]);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {entries.map(({ key, Icon, urlFor }) => (
        <a
          key={key}
          href={urlFor(socials[key]!)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${key} profile`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition active:bg-neutral-200"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}
