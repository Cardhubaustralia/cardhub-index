import { SkeletonStatRow } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="panel flex items-center gap-4 p-6">
        <div className="h-16 w-16 animate-pulse rounded-3xl bg-slate-200" />
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <SkeletonStatRow n={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel h-20 animate-pulse bg-slate-50" />
        ))}
      </div>
    </div>
  );
}
