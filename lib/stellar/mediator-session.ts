import { generateEphemeralKeypair, type EphemeralMediator } from "./mediator";

let activeMediator: EphemeralMediator | null = null;

export function createMediatorSession(): EphemeralMediator {
  activeMediator = generateEphemeralKeypair();
  return activeMediator;
}

export function getMediatorSession(): EphemeralMediator | null {
  return activeMediator;
}

export function clearMediatorSession(): void {
  activeMediator = null;
}
