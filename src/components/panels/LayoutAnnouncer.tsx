"use client";

/** The one polite live region per grid; the grid clears it after a few seconds so a repeat re-announces. */
export function LayoutAnnouncer({ message, helpId }: { message: string; helpId: string }) {
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
      <p id={helpId} className="sr-only">
        Every card is a widget. Press Space on a card&apos;s move handle to grab it, arrow keys move it, Shift plus arrow swaps it with a
        neighbour, Alt plus arrow resizes it, Enter drops, Escape cancels.
      </p>
    </>
  );
}
