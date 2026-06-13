import type { Network } from "@/config/networks";
import { getMediatorPublicKey } from "@/config/networks";
import { isValidGAddress, isValidMemo } from "@/lib/utils/validation";
import { lookupExchange } from "@/lib/exchange-registry";
import { buildPlan } from "@/lib/stellar/tx-builder";
import type { AccountState } from "@/types/account";
import type { PlannedStep, PlanBlocker } from "@/types/plan";
import type { MemoType, PlanRequest, PlanStep } from "@/types/api-v1";

// Pure (network-free) request-side logic for the v1 API, kept separate from the
// IO orchestrator in plan-service.ts so it stays directly unit-testable and so
// importing it never pulls the fetch-based readers into a test's type context.

/** The mediator/memo decision derived from the request alone (no network). */
export interface PlanDecision {
  mediatorRequired: boolean;
  requiresMemo: boolean;
  memo: string | null;
  memoType: MemoType | null;
  /** Blockers known before reading on-chain state (memo / mediator config). */
  preReadBlockers: PlanBlocker[];
}

export interface ResolvedPlan {
  accountState: AccountState;
  mediatorRequired: boolean;
  requiresMemo: boolean;
  memo: string | null;
  memoType: MemoType | null;
  steps: PlannedStep[];
  blockers: PlanBlocker[];
}

export type DecisionResult =
  | { ok: true; decision: PlanDecision }
  | { ok: false; status: number; error: string };

/**
 * Validates addresses and resolves the mediator/memo requirements.
 *
 * Memo enforcement mirrors the invariant that a missing memo for a known
 * exchange must block rather than be silently dropped - it surfaces as a
 * blocker, leaving the plan non-executable.
 */
export function decidePlan(req: PlanRequest, network: Network): DecisionResult {
  const { account, destination } = req;

  if (!isValidGAddress(account)) {
    return { ok: false, status: 400, error: "invalid_account" };
  }
  if (!isValidGAddress(destination)) {
    return { ok: false, status: 400, error: "invalid_destination" };
  }
  if (account === destination) {
    return { ok: false, status: 400, error: "destination_same_as_source" };
  }

  const preReadBlockers: PlanBlocker[] = [];
  const exchange = lookupExchange(destination);
  const mediatorRequired = exchange?.requiresMediator ?? false;
  const requiresMemo = exchange?.requiresMemo ?? false;

  let memo: string | null = null;
  let memoType: MemoType | null = null;

  if (requiresMemo) {
    memoType = exchange!.memoType;
    if (!req.memo || !isValidMemo(req.memo, memoType)) {
      preReadBlockers.push({
        message: `Destination ${exchange!.name} requires a valid ${memoType} memo. Provide one to merge into this exchange.`,
      });
    } else {
      memo = req.memo;
    }
  } else if (req.memo) {
    // Memo supplied for a non-exchange (or no-memo) destination: it must be typed.
    if (!req.memoType) {
      return { ok: false, status: 400, error: "missing_memo_type" };
    }
    if (!isValidMemo(req.memo, req.memoType)) {
      return { ok: false, status: 400, error: "invalid_memo" };
    }
    memo = req.memo;
    memoType = req.memoType;
  }

  if (mediatorRequired && !getMediatorPublicKey(network)) {
    preReadBlockers.push({
      message:
        "This destination needs the exchange (mediator) flow, but no shared mediator account is configured on this deployment.",
    });
  }

  return {
    ok: true,
    decision: { mediatorRequired, requiresMemo, memo, memoType, preReadBlockers },
  };
}

/**
 * Runs the deterministic planner against an already-read account state and
 * merges the pre-read blockers with the planner's blockers.
 */
export function finalizePlan(accountState: AccountState, decision: PlanDecision): ResolvedPlan {
  const planResult = buildPlan(accountState, decision.mediatorRequired);
  return {
    accountState,
    mediatorRequired: decision.mediatorRequired,
    requiresMemo: decision.requiresMemo,
    memo: decision.memo,
    memoType: decision.memoType,
    steps: planResult.steps,
    blockers: [...decision.preReadBlockers, ...planResult.blockers],
  };
}

/** Maps internal planned steps to the public, execution-stripped DTO. */
export function toPlanSteps(steps: PlannedStep[]): PlanStep[] {
  return steps.map((s) => ({
    index: s.index,
    type: s.type,
    title: s.title,
    description: s.description,
    operationCount: s.operationCount,
    estimatedFeeLumens: s.estimatedFeeLumens,
    ...(s.affectedAsset ? { affectedAsset: s.affectedAsset } : {}),
  }));
}
