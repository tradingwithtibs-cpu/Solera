"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">We couldn’t load this page.</h1>
      <p className="text-neutral-500">Try again or return to Discover.</p>
      <button onClick={retry} className="btn-primary">
        Try again
      </button>
      <Link href="/" className="btn-secondary">
        Back to Discover
      </Link>
    </div>
  );
}
