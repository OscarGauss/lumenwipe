import { NextRequest } from "next/server";
import { isValidNetwork } from "@/config/networks";
import { checkNamespacedRateLimit } from "@/lib/kv";
import { resolvePlanContext } from "@/lib/api/plan-service";
import { toPlanSteps } from "@/lib/api/plan-decision";
import { corsPreflight, jsonWithCors } from "@/lib/api/cors";
import type { PlanRequest, PlanResponse } from "@/types/api-v1";

const V1_PLAN_LIMIT_PER_DAY = 300;

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
  if (!(await checkNamespacedRateLimit("v1", ip, V1_PLAN_LIMIT_PER_DAY))) {
    return jsonWithCors({ error: "rate_limited" }, { status: 429 });
  }

  let body: PlanRequest;
  try {
    body = (await req.json()) as PlanRequest;
  } catch {
    return jsonWithCors({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await resolvePlanContext(body, network);
    if (!result.ok) {
      return jsonWithCors({ error: result.error }, { status: result.status });
    }

    const { data } = result;
    const response: PlanResponse = {
      account: body.account,
      destination: body.destination,
      network,
      mediatorRequired: data.mediatorRequired,
      requiresMemo: data.requiresMemo,
      memoType: data.memoType,
      executable: data.blockers.length === 0,
      blockers: data.blockers.map((b) => ({ message: b.message })),
      steps: toPlanSteps(data.steps),
    };
    return jsonWithCors(response);
  } catch (err) {
    console.error("v1 plan error:", err);
    return jsonWithCors({ error: "plan_failed" }, { status: 500 });
  }
}
