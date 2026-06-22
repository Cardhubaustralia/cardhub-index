import { SkeletonStatRow } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-32 animate-pulse rounded-2xl bg-slate-200" />
      <SkeletonStatRow n={3} />
      <SkeletonStatRow n={3} />
    </div>
  );
}
