"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Network } from "@/config/networks";
import { useDemolishStore } from "@/store/demolish";
import CompletionReceipt from "@/components/complete/CompletionReceipt";

export default function CompletePage({ params }: { params: { network: Network } }) {
  const router = useRouter();
  const { phase, executionPlan } = useDemolishStore();

  useEffect(() => {
    if (phase !== "COMPLETE" && executionPlan.filter((s) => s.status === "confirmed").length === 0) {
      router.replace(`/${params.network}`);
    }
  }, [phase, executionPlan, params.network, router]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <CompletionReceipt network={params.network} />
    </div>
  );
}
