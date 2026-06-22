import { SkeletonStatRow, SkeletonCardGrid } from "@/components/Skeletons";

// Route-transition fallback: shaped like a typical page so the layout
// holds steady and content fills in, rather than flashing a spinner.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-2xl bg-slate-200" />
      <SkeletonStatRow />
      <SkeletonCardGrid />
    </div>
  );
}
