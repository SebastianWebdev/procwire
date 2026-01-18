import { TransportError } from "./errors.js";
import type { TransportState } from "../transport/types.js";

/**
 * Asserts that current state is one of the allowed states.
 * Throws TransportError if not.
 */
export function assertState(current: TransportState, allowed: TransportState[]): void {
  if (!allowed.includes(current)) {
    throw new TransportError(
      `Invalid state: expected one of [${allowed.join(", ")}], got '${current}'`,
    );
  }
}

/**
 * Map of allowed state transitions.
 */
export const TRANSPORT_STATE_TRANSITIONS: Record<TransportState, TransportState[]> = {
  disconnected: ["connecting"],
  connecting: ["connected", "error", "disconnected"],
  connected: ["disconnected", "error"],
  error: ["disconnected"],
};

/**
 * Validates and returns next state if transition is allowed.
 * Throws TransportError if transition is invalid.
 */
export function transitionState(current: TransportState, next: TransportState): TransportState {
  const allowed = TRANSPORT_STATE_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new TransportError(
      `Invalid state transition: '${current}' -> '${next}'. Allowed: [${allowed.join(", ")}]`,
    );
  }
  return next;
}
