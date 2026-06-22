import { SkeletonStatRow } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-4 w-64 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <div className="panel aspect-[5/7] w-full animate-pulse bg-slate-100" />
          <div className="panel h-64 animate-pulse bg-slate-50" />
        </div>
        <div className="space-y-6">
          <div className="h-9 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="h-10 w-40 animate-pulse rounded bg-slate-200" />
          <SkeletonStatRow />
          <div className="panel h-72 animate-pulse bg-slate-50" />
        </div>
      </div>
    </div>
  );
}
