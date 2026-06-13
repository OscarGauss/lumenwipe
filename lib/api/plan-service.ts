import type { Network } from "@/config/networks";
import { getAccountState } from "@/lib/stellar/account";
import { getLiveAccountState } from "@/lib/stellar/account-live";
import { needsLiveRescan } from "@/lib/stellar/scan-fallback";
import { AccountNotFoundError } from "@/lib/utils/errors";
import type { AccountState } from "@/types/account";
import type { PlanRequest } from "@/types/api-v1";
import { decidePlan, finalizePlan, type ResolvedPlan } from "@/lib/api/plan-decision";

export type ResolveResult =
  | { ok: true; data: ResolvedPlan }
  | { ok: false; status: number; error: string };

/**
 * Full resolution used by both v1 endpoints: decide (pure), re-read live
 * on-chain state (with the same live-rescan fallback the UI uses), then
 * assemble the plan. The live re-read upholds the "never build from stale
 * enumeration data" invariant.
 */
export async function resolvePlanContext(
  req: PlanRequest,
  network: Network
): Promise<ResolveResult> {
  const decided = decidePlan(req, network);
  if (!decided.ok) return decided;

  let accountState: AccountState;
  try {
    accountState = await getAccountState(req.account, network);
    if (needsLiveRescan(accountState)) {
      try {
        accountState = await getLiveAccountState(req.account, network);
      } catch {
        // Keep the SE-based result if the live path also fails.
      }
    }
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      return { ok: false, status: 404, error: "account_not_found" };
    }
    throw err;
  }

  return { ok: true, data: finalizePlan(accountState, decided.decision) };
}
