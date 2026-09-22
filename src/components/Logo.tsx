import Image from "next/image";

/**
 * The Solera mark: three Solana bars in the era gradient over "era" in
 * glass, on a black tile. The mark reads as the whole name, so it stands
 * alone; pass `wordmark` to add the word beside it where a label helps.
 */
export function Logo({ size = 40, wordmark = false, className = "" }: { size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Image
        src="/brand/solera-mark-256.png"
        alt="Solera"
        width={size}
        height={size}
        priority
        style={{ borderRadius: Math.round(size * 0.22) }}
      />
      {wordmark && <span className="font-semibold tracking-tight text-neutral-900">Solera</span>}
    </span>
  );
}
