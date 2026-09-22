"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "./icons";

export function TopBar({
  title,
  action,
  heading = true,
}: {
  title: string;
  action?: React.ReactNode;
  heading?: boolean;
}) {
  const router = useRouter();
  const Title = heading ? "h1" : "p";

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 glass px-4 py-3.5 backdrop-blur">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.push("/");
        }}
        aria-label="Go back"
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100"
      >
        <ArrowLeftIcon className="h-5 w-5" />
      </button>
      <Title className="min-w-0 flex-1 truncate text-[15px] font-semibold text-neutral-900">{title}</Title>
      {action}
    </div>
  );
}
