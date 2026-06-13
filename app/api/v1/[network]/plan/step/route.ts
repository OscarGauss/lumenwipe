import { NextRequest } from "next/server";
import { isValidNetwork, NETWORK_PASSPHRASES } from "@/config/networks";
import { checkNamespacedRateLimit } from "@/lib/kv";
import { resolvePlanContext } from "@/lib/api/plan-service";
import { buildStepXdrForPlan, type StepBuildContext } from "@/lib/stellar/step-engine";
import { NoConversionPathError } from "@/lib/utils/errors";
import { corsPreflight, jsonWithCors } from "@/lib/api/cors";
import type { BuildStepRequest, BuildStepResponse } from "@/types/api-v1";

const V1_STEP_LIMIT_PER_DAY = 300;

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  if (!isValidNetwork(network)) {
    return jsonWithCors({ error: "invalid_network" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!(await checkNamespacedRateLimit("v1", ip, V1_STEP_LIMIT_PER_DAY))) {
    return jsonWithCors({ error: "rate_limited" }, { status: 429 });
  }

  let body: BuildStepRequest;
  try {
    body = (await req.json()) as BuildStepRequest;
  } catch {
    return jsonWithCors({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.stepIndex !== "number" || !Number.isInteger(body.stepIndex)) {
    return jsonWithCors({ error: "invalid_step_index" }, { status: 400 });
  }

  try {
    const result = await resolvePlanContext(body, network);
    if (!result.ok) {
      return jsonWithCors({ error: result.error }, { status: result.status });
    }

    const { data } = result;
    // A non-executable plan must never hand out an XDR - surface the blockers.
    if (data.blockers.length > 0) {
      return jsonWithCors(
        { error: "plan_blocked", blockers: data.blockers.map((b) => ({ message: b.message })) },
        { status: 409 }
      );
    }

    const step = data.steps.find((s) => s.index === body.stepIndex);
    if (!step) {
      return jsonWithCors({ error: "invalid_step" }, { status: 400 });
    }

    const ctx: StepBuildContext = {
      network,
      sourceAddress: body.account,
      accountState: data.accountState,
      destinationAddress: body.destination,
      memo: data.memo,
      memoType: data.memoType,
      mediatorRequired: data.mediatorRequired,
      executionPlan: data.steps,
      liveNativeBalanceLumens: data.accountState.nativeBalanceLumens,
      // Only the fused CLOSE_ACCOUNT step reads dispositions, and the v1 plan
      // never emits it (buildPlan is called without fastPathEligible), so the
      // step-by-step API has no per-asset dispositions to forward.
      assetDispositions: {},
    };

    const xdr = await buildStepXdrForPlan(
      body.fallbackToIssuer ? { ...step, fallbackToIssuer: true } : step,
      ctx
    );

    const response: BuildStepResponse = {
      stepIndex: step.index,
      type: step.type,
      xdr,
      operationCount: step.operationCount,
      networkPassphrase: NETWORK_PASSPHRASES[network],
      requiresMediatorCosign: step.type === "MERGE" && data.mediatorRequired,
    };
    return jsonWithCors(response);
  } catch (err) {
    if (err instanceof NoConversionPathError) {
      // No DEX route for this asset. The consumer can retry this same step with
      // fallbackToIssuer: true to send the balance back to the issuer instead.
      return jsonWithCors(
        { error: "no_conversion_path", retryWithFallback: !body.fallbackToIssuer },
        { status: 409 }
      );
    }
    console.error("v1 plan/step error:", err);
    return jsonWithCors({ error: "build_failed" }, { status: 502 });
  }
}
