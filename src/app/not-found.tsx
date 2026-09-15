import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="eyebrow">404 · A little off course</p>
      <h1 className="text-3xl font-semibold">This page isn’t here.</h1>
      <p className="text-neutral-500">Find an investor or explore a stock from Discover.</p>
      <Link href="/" className="btn-primary">
        Back to Discover
      </Link>
    </div>
  );
}
