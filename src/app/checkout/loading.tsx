import { SkeletonTable } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-2xl bg-slate-200" />
      <SkeletonTable rows={4} />
      <SkeletonTable rows={3} />
    </div>
  );
}
