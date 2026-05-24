"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Network } from "@/config/networks";
import { useDemolishStore } from "@/store/demolish";
import ExecutionWizard from "@/components/execution/ExecutionWizard";

export default function ExecutePage({ params }: { params: { network: Network } }) {
  const router = useRouter();
  const { executionPlan, sourceAddress } = useDemolishStore();

  useEffect(() => {
    if (!sourceAddress || executionPlan.length === 0) {
      router.replace(`/${params.network}`);
    }
  }, [sourceAddress, executionPlan.length, params.network, router]);

  if (!sourceAddress || executionPlan.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/${params.network}/analyze`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">Executing plan</h1>
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          {sourceAddress.slice(0, 8)}...
        </span>
      </div>

      <ExecutionWizard network={params.network} />
    </div>
  );
}
