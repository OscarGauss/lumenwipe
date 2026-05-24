"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Network } from "@/config/networks";
import type { AccountState } from "@/types/account";
import type { PlannedStep } from "@/types/plan";
import { useDemolishStore } from "@/store/demolish";
import { useNetworkStore } from "@/store/network";
import { buildPlan } from "@/lib/stellar/tx-builder";
import { createMediatorSession } from "@/lib/stellar/mediator-session";
import PlanView from "@/components/plan/PlanView";

export default function AnalyzePage({ params }: { params: { network: Network } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const network = useNetworkStore((s) => s.network);

  const source = searchParams.get("source");
  const dest = searchParams.get("dest");

  const {
    setAccountState,
    setAddresses,
    setMediatorRequired: syncMediatorToStore,
    sourceAddress,
    destinationAddress,
  } = useDemolishStore();

  const [account, setAccount] = useState<AccountState | null>(null);
  const [plan, setPlanState] = useState<PlannedStep[]>([]);
  const [mediatorRequired, setMediatorRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveSource = source ?? sourceAddress;
  const effectiveDest = dest ?? destinationAddress;

  const fetchData = useCallback(async () => {
    if (!effectiveSource || !effectiveDest) {
      router.push(`/${params.network}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [accountRes, mediatorRes] = await Promise.all([
        fetch(`/api/${network}/account/${effectiveSource}`),
        fetch(`/api/${network}/mediator/check/${effectiveDest}`),
      ]);

      if (!accountRes.ok) {
        const data = await accountRes.json();
        setError(data.error ?? "Failed to fetch account data");
        return;
      }

      const accountData: AccountState = await accountRes.json();
      const mediatorData = await mediatorRes.json();
      const needsMediator = mediatorData.requiresMediator ?? false;

      let mediatorPublicKey: string | undefined;
      if (needsMediator) {
        const session = createMediatorSession();
        mediatorPublicKey = session.publicKey;
      }

      setAccount(accountData);
      setAccountState(accountData);
      setAddresses(effectiveSource, effectiveDest);
      setMediatorRequired(needsMediator);
      syncMediatorToStore(needsMediator, mediatorPublicKey);

      const generatedPlan = buildPlan(accountData, needsMediator);
      setPlanState(generatedPlan);
    } catch {
      setError("Failed to analyze account. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [effectiveSource, effectiveDest, network, params.network, router, setAccountState, setAddresses]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-stellar" />
        <p className="text-muted-foreground text-sm">Analyzing account...</p>
        <p className="text-xs text-muted-foreground/60 font-mono truncate max-w-xs">
          {effectiveSource}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-card border border-destructive/30 rounded-xl p-6 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="font-medium">Analysis failed</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link
            href={`/${params.network}`}
            className="inline-flex items-center gap-1.5 text-sm text-stellar hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Go back
          </Link>
        </div>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/${params.network}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">Execution plan</h1>
      </div>

      <PlanView
        account={account}
        plan={plan}
        destinationAddress={effectiveDest!}
        mediatorRequired={mediatorRequired}
        network={params.network}
        onRefresh={fetchData}
        loading={loading}
      />
    </div>
  );
}
