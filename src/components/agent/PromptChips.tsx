"use client";

interface Props {
  primary: string[];
  secondary: string[];
  disabled: boolean;
  onPick: (prompt: string) => void;
}

/** The starters (agent-ux §1.3): `.lens-chip` sentences that send when tapped. */
export function PromptChips({ primary, secondary, disabled, onPick }: Props) {
  const row = (chips: string[], label: string) => (
    <div className="lens-chips" role="group" aria-label={label}>
      {chips.map((c) => (
        <button key={c} type="button" className="lens-chip" disabled={disabled} onClick={() => onPick(c)}>
          {c}
        </button>
      ))}
    </div>
  );
  return (
    <>
      {row(primary, "Try these")}
      {secondary.length > 0 && row(secondary, "More")}
    </>
  );
}
