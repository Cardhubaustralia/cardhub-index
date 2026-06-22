"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/lib/actions";

export default function MarkAllRead() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn-ghost text-sm"
      disabled={pending}
      onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}
    >
      Mark all read
    </button>
  );
}
