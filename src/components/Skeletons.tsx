// Content-shaped skeletons (Polaris-style). Each mirrors the real
// component's layout so boxes fill in place instead of flashing a spinner.

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/80 ${className}`} />;
}

export function SkeletonStatRow({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="panel px-4 py-3">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="mt-2 h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ n = 10 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="panel overflow-hidden p-0">
          <div className="aspect-[5/7] w-full animate-pulse bg-slate-100" />
          <div className="space-y-2 p-3">
            <Shimmer className="h-4 w-3/4" />
            <Shimmer className="h-3 w-1/2" />
            <div className="mt-1 flex items-center justify-between">
              <Shimmer className="h-5 w-14" />
              <Shimmer className="h-4 w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonHeroMovers({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="panel flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <div className="h-24 w-[68px] shrink-0 animate-pulse rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-4 w-3/4" />
              <Shimmer className="h-3 w-1/2" />
              <Shimmer className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex items-end justify-between border-t border-slate-100 pt-3">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ n = 6 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="panel flex items-center gap-3 p-3">
          <div className="h-16 w-12 shrink-0 animate-pulse rounded-lg bg-slate-100" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
          </div>
          <Shimmer className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="panel space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Shimmer className="h-4 w-40" />
          <Shimmer className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
