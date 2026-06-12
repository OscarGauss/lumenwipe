import type { AccountState } from "@/types/account";
import type { PlannedStep, StepType, BuildPlanResult, PlanBlocker } from "@/types/plan";
import { estimateFeeLumens } from "@/lib/utils/amounts";
import { batchItems } from "./batching";
import { OP_BATCH_LIMIT } from "@/config/constants";

function step(
  index: number,
  type: StepType,
  title: string,
  description: string,
  operationCount: number,
  extra?: Partial<PlannedStep>
): PlannedStep {
  return {
    index,
    type,
    title,
    description,
    operationCount,
    estimatedFeeLumens: estimateFeeLumens(operationCount),
    txXdr: null,
    status: "pending",
    txHash: null,
    error: null,
    ...extra,
  };
}

export function buildPlan(accountState: AccountState, mediatorRequired: boolean): BuildPlanResult {
  const steps: PlannedStep[] = [];
  const blockers: PlanBlocker[] = [];
  let idx = 0;

  const { signers, thresholds, dataEntries, openOffers, trustlines } = accountState;
  const masterKey = accountState.address;
  const extraSigners = signers.filter((s) => s.key !== masterKey);

  const needsSignerNormalization =
    extraSigners.length > 0 || thresholds.med > 1 || thresholds.high > 1;

  // Sponsoring blocker: numSponsoring > 0 means this account is the reserve sponsor for
  // entries on other accounts. stellar-core refuses ACCOUNT_MERGE when getNumSponsoring > 0.
  // Surface this before building the rest of the plan so users don't reach the final step
  // only to fail.
  if (accountState.numSponsoring > 0) {
    blockers.push({
      message:
        `This account is sponsoring ${accountState.numSponsoring} entr${accountState.numSponsoring === 1 ? "y" : "ies"} ` +
        `on other accounts. All sponsorships must be revoked before the account can be merged.`,
    });
  }

  // Pool share blocker: liquidity pool share trustlines cost 2 base reserves each and must
  // be withdrawn from the pool (via a DEX UI) before the trustline can be removed.
  if (accountState.poolShares.length > 0) {
    blockers.push({
      message:
        `This account holds ${accountState.poolShares.length} liquidity pool share(s). ` +
        `Withdraw from the pool using a DEX interface (e.g. Stellar Expert) before continuing.`,
    });
  }

  // Sub-entry mismatch blocker: we enumerated fewer sub-entries than the ledger reports.
  // Proceeding would leave unknown entries behind - block rather than build an incomplete plan.
  if (accountState.subEntryMismatch) {
    blockers.push({
      message:
        "This account has entries that could not be enumerated. " +
        "The analysis may be incomplete - do not proceed until the discrepancy is resolved.",
    });
  }

  // Threshold gating: SetOptions is a HIGH-threshold operation. If the master
  // key's weight alone cannot reach the current high threshold, the normalization
  // tx can never be self-authorized - surface this as a blocker before building a
  // plan that would fail at signing time.
  if (needsSignerNormalization) {
    const masterSigner = signers.find((s) => s.key === masterKey);
    const masterWeight = masterSigner?.weight ?? 0;
    if (masterWeight < thresholds.high) {
      blockers.push({
        message:
          `The master key has weight ${masterWeight}, but removing signers or changing thresholds ` +
          `requires weight ${thresholds.high} (the current high threshold). ` +
          `A hash preimage or pre-authorized transaction is needed to authorize this change. ` +
          `This flow supports single-key authorization only.`,
      });
    }
  }

  if (needsSignerNormalization) {
    steps.push(
      step(
        idx++,
        "NORMALIZE_SIGNERS",
        "Remove extra signers",
        `Remove ${extraSigners.length} additional signer(s) and reset authorization thresholds so this key alone can authorize transactions.`,
        extraSigners.length + 1
      )
    );
  }

  if (dataEntries.length > 0) {
    const batches = batchItems(dataEntries, OP_BATCH_LIMIT);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      steps.push(
        step(
          idx++,
          "REMOVE_DATA_ENTRIES",
          batches.length > 1
            ? `Remove data entries (batch ${i + 1}/${batches.length})`
            : "Remove data entries",
          `Clear ${batch.length} data entr${batch.length === 1 ? "y" : "ies"} stored on this account.`,
          batch.length
        )
      );
    }
  }

  if (openOffers.length > 0) {
    const batches = batchItems(openOffers, OP_BATCH_LIMIT);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      steps.push(
        step(
          idx++,
          "CANCEL_OFFERS",
          batches.length > 1
            ? `Cancel DEX offers (batch ${i + 1}/${batches.length})`
            : "Cancel open DEX offers",
          `Cancel ${batch.length} open offer${batch.length === 1 ? "" : "s"} on the Stellar DEX.`,
          batch.length
        )
      );
    }
  }

  const trustlinesWithBalance = trustlines.filter((tl) => parseFloat(tl.balance) > 0);
  for (const tl of trustlinesWithBalance) {
    steps.push(
      step(
        idx++,
        "CONVERT_ASSETS",
        `Convert ${tl.code} to XLM`,
        `Exchange ${tl.balance} ${tl.code} for XLM via the Stellar DEX.`,
        1,
        { affectedAsset: tl.asset }
      )
    );
  }

  if (trustlines.length > 0) {
    const batches = batchItems(trustlines, OP_BATCH_LIMIT);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      steps.push(
        step(
          idx++,
          "REMOVE_TRUSTLINES",
          batches.length > 1
            ? `Remove trustlines (batch ${i + 1}/${batches.length})`
            : "Remove trustlines",
          `Remove ${batch.length} trustline${batch.length === 1 ? "" : "s"} to recover the base reserve.`,
          batch.length
        )
      );
    }
  }

  steps.push(
    step(
      idx++,
      "MERGE",
      mediatorRequired ? "Merge and forward to exchange" : "Merge account",
      mediatorRequired
        ? "Close this account and forward the full balance to your exchange deposit address in one atomic transaction, routed through a shared intermediary. You recover essentially all of your XLM; only standard network fees apply."
        : "Merge this account, transferring the XLM balance to the destination account and removing it from the Stellar ledger.",
      mediatorRequired ? 2 : 1
    )
  );

  return { steps, blockers };
}
