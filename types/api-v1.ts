import type { Network } from "@/config/networks";
import type { StepType } from "@/types/plan";

export type MemoType = "text" | "id" | "hash";

/** Body shared by both v1 endpoints. */
export interface PlanRequest {
  account: string;
  destination: string;
  memo?: string;
  memoType?: MemoType;
}

export interface BuildStepRequest extends PlanRequest {
  stepIndex: number;
  /** Send the asset back to its issuer when no DEX conversion path exists. */
  fallbackToIssuer?: boolean;
}

/** Descriptive view of a planned step - no execution-only fields. */
export interface PlanStep {
  index: number;
  type: StepType;
  title: string;
  description: string;
  operationCount: number;
  estimatedFeeLumens: string;
  affectedAsset?: string;
}

export interface PlanBlockerDto {
  message: string;
}

export interface PlanResponse {
  account: string;
  destination: string;
  network: Network;
  mediatorRequired: boolean;
  requiresMemo: boolean;
  memoType: MemoType | null;
  /** True only when there are no blockers - the consumer may build steps. */
  executable: boolean;
  blockers: PlanBlockerDto[];
  steps: PlanStep[];
}

export interface BuildStepResponse {
  stepIndex: number;
  type: StepType;
  /** Unsigned transaction envelope, base64 XDR. */
  xdr: string;
  operationCount: number;
  networkPassphrase: string;
  /**
   * When true this is the mediator merge: the consumer signs locally, then
   * POSTs the result to /api/[network]/mediator/sign for the mediator
   * co-signature before submitting.
   */
  requiresMediatorCosign: boolean;
}
