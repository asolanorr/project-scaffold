// No text in these: they are the static shell of routes whose locale is not
// known until the request (`[id]` has no generateStaticParams), so a
// translated label would itself block prerendering. `aria-busy` is what a
// screen reader gets; the streamed content follows within the same response.

const Line = ({ className }: { className: string }) => (
  <div className={`h-4 animate-pulse rounded bg-tertiary ${className}`} />
);

/** Placeholder for the list while the session and the page are read. */
export function ProjectsListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex gap-3">
        <div className="h-9 w-full max-w-xs animate-pulse rounded-lg bg-tertiary" />
        <div className="h-9 w-48 animate-pulse rounded-lg bg-tertiary" />
      </div>
      <div className="flex flex-col gap-4 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary">
        <Line className="w-1/3" />
        <Line className="w-2/3" />
        <Line className="w-1/2" />
        <Line className="w-3/5" />
      </div>
    </div>
  );
}

/** Placeholder for the detail and edit pages while the project streams in. */
export function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="h-5 w-24 animate-pulse rounded bg-tertiary" />
      <div className="h-8 w-1/2 max-w-xs animate-pulse rounded bg-tertiary" />
      <div className="h-6 w-20 animate-pulse rounded-full bg-tertiary" />
      <Line className="w-3/4" />
      <Line className="w-1/2" />
    </div>
  );
}
