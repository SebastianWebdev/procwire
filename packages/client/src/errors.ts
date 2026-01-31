/**
 * Error types and factory functions for @procwire/client.
 *
 * @module
 */

/**
 * Base error class for all Procwire client errors.
 */
export class ProcwireClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcwireClientError";
  }
}

/**
 * Factory functions for Client-related errors.
 */
export const ClientErrors = {
  /** Cannot add handlers after start */
  cannotAddHandlerAfterStart: () => new ProcwireClientError("Cannot add handlers after start()"),

  /** Cannot add events after start */
  cannotAddEventAfterStart: () => new ProcwireClientError("Cannot add events after start()"),

  /** Client already started */
  alreadyStarted: () => new ProcwireClientError("Client already started"),

  /** Client not connected */
  notConnected: () => new ProcwireClientError("Client not connected"),

  /** Unknown event name */
  unknownEvent: (eventName: string) => new ProcwireClientError(`Unknown event: ${eventName}`),

  /** Response already sent */
  responseAlreadySent: () => new ProcwireClientError("Response already sent"),
} as const;
