"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { AccountState } from "@/types/account";
import type { PlannedStep } from "@/types/plan";
import type { Network } from "@/config/networks";
import { useDemolishStore } from "@/store/demolish";
import AccountSummaryCard from "./AccountSummaryCard";
import ExecutionPlanList from "./ExecutionPlanList";
import BlockersPanel from "./BlockersPanel";

interface PlanViewProps {
  account: AccountState;
  plan: PlannedStep[];
  destinationAddress: string;
  mediatorRequired: boolean;
  network: Network;
  onRefresh: () => void;
  loading: boolean;
}

export default function PlanView({
  account,
  plan,
  destinationAddress,
  mediatorRequired,
  network,
  onRefresh,
  loading,
}: PlanViewProps) {
  const router = useRouter();
  const { setPhase, setPlan, setMediatorRequired } = useDemolishStore();

  const totalFee = plan
    .reduce((sum, s) => sum + parseFloat(s.estimatedFeeLumens), 0)
    .toFixed(7);

  function handleProceed() {
    setPlan(plan);
    setMediatorRequired(mediatorRequired);
    setPhase("STEP_EXECUTING");
    router.push(`/${network}/execute`);
  }

  return (
    <div className="space-y-5">
      <AccountSummaryCard
        account={account}
        destinationAddress={destinationAddress}
        totalFee={totalFee}
        mediatorRequired={mediatorRequired}
      />

      <BlockersPanel blockers={[]} />

      {mediatorRequired && (
        <div className="bg-card border border-warning/30 rounded-xl p-4 text-sm">
          <p className="font-medium text-warning mb-1">Intermediary account required</p>
          <p className="text-muted-foreground">
            Your destination does not support direct account merges. A temporary
            intermediary account will be created to route your funds. A 1.5 XLM reserve
            is required upfront — approximately 1.0 XLM will remain permanently locked
            in the intermediary as a ledger reserve and cannot be recovered.
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Execution plan</h3>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="p-3 space-y-2">
          <ExecutionPlanList steps={plan} />
        </div>
        <div className="border-t border-border px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {plan.length} step{plan.length !== 1 ? "s" : ""} · estimated fees
          </span>
          <span className="font-mono text-xs text-muted-foreground">{totalFee} XLM</span>
        </div>
      </div>

      <button
        onClick={handleProceed}
        disabled={plan.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-stellar text-black font-semibold py-3 px-4 rounded-lg hover:bg-stellar/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Begin execution
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Each step requires your explicit confirmation before signing.
      </p>
    </div>
  );
}
