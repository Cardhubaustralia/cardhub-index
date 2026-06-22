import { SkeletonStatRow, SkeletonTable } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-40 animate-pulse rounded-2xl bg-slate-200" />
      <div className="panel h-64 animate-pulse bg-slate-50" />
      <SkeletonStatRow />
      <SkeletonTable rows={5} />
      <SkeletonTable rows={4} />
    </div>
  );
}
