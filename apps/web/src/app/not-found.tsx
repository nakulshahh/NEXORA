import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-32 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-ink-2">HTTP 404</p>
      <h1 className="font-display mt-4 text-[clamp(4rem,12vw,9rem)] leading-none"><span className="text-signal">404</span> <em>Not Found</em></h1>
      <p className="mx-auto mt-6 max-w-md text-ink-2">The server looked everywhere it knows to look. That route does not exist.</p>
      <Link href="/roadmap" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 text-sm font-medium text-bg hover:bg-signal hover:text-white">Back to the roadmap</Link>
    </div>
  );
}
