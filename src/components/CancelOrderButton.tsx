"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrder } from "@/lib/actions";

export default function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      className="text-xs font-extrabold text-rose-600 hover:underline disabled:opacity-50"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await cancelOrder(orderId);
          router.refresh();
        })
      }
    >
      Cancel
    </button>
  );
}
