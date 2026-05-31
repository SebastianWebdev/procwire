/**
 * Error types and factory functions for @procwire/bun-core.
 *
 * @module
 */

// ═══════════════════════════════════════════════════════════════════════════
// BASE ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base error class for all Procwire errors.
 */
export class ProcwireError extends Error {
  /** The original error payload from the child, when one was provided. */
  readonly data?: unknown;

  constructor(message: string, data?: unknown) {
    super(message);
    this.name = "ProcwireError";
    if (data !== undefined) {
      this.data = data;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE ERRORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory functions for Module-related errors.
 */
export const ModuleErrors = {
  /** Module is not ready for operations */
  notReady: (name: string, state: string) =>
    new ProcwireError(`Module "${name}" is not ready (state: ${state})`),

  /** Module disconnected while requests were pending */
  disconnected: () => new ProcwireError("Module disconnected"),

  /** Executable not configured before spawn */
  executableNotConfigured: (name: string) =>
    new ProcwireError(`Module "${name}": executable not configured`),

  /** No methods registered before spawn */
  noMethodsRegistered: (name: string) =>
    new ProcwireError(`Module "${name}": no methods registered`),

  /** Unknown method name */
  unknownMethod: (method: string) => new ProcwireError(`Unknown method: ${method}`),

  /** Method not registered by child */
  methodNotRegistered: (method: string) =>
    new ProcwireError(`Method "${method}" not registered by child`),

  /** Method not in child schema */
  methodNotInSchema: (method: string) =>
    new ProcwireError(`Method "${method}" not in child schema`),

  /** Method returns stream but send() was called */
  methodReturnsStream: (method: string) =>
    new ProcwireError(`Method "${method}" returns a stream. Use .stream() instead of .send().`),

  /** Method does not return stream but stream() was called */
  methodNotStream: (method: string, response: string) =>
    new ProcwireError(
      `Method "${method}" does not return a stream (response: "${response}"). ` +
        `Use .send() instead of .stream().`,
    ),

  /** Request timeout */
  timeout: (method: string) => new ProcwireError(`Timeout waiting for response from "${method}"`),

  /** Unknown event name */
  unknownEvent: (eventName: string) => new ProcwireError(`Unknown event: ${eventName}`),

  /** Remote error from child */
  remoteError: (errorData: unknown) => new ProcwireError(extractErrorMessage(errorData), errorData),
} as const;

/**
 * Derive a human-readable message from a remote error payload.
 *
 * The child usually sends a string, but a structured object (e.g. with a
 * `message` field) must not collapse to "[object Object]" via String().
 */
function extractErrorMessage(errorData: unknown): string {
  if (typeof errorData === "string") {
    return errorData;
  }
  if (
    errorData !== null &&
    typeof errorData === "object" &&
    "message" in errorData &&
    typeof (errorData as { message: unknown }).message === "string"
  ) {
    return (errorData as { message: string }).message;
  }
  try {
    return JSON.stringify(errorData) ?? String(errorData);
  } catch {
    return String(errorData);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MANAGER ERRORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory functions for ModuleManager-related errors.
 */
export const ManagerErrors = {
  /** Module already registered */
  alreadyRegistered: (name: string) => new ProcwireError(`Module "${name}" already registered`),

  /** Module not registered */
  notRegistered: (name: string) => new ProcwireError(`Module "${name}" not registered`),

  /** Init timeout */
  initTimeout: (name: string, timeout: number) =>
    new ProcwireError(`Module "${name}" did not send $init within ${timeout}ms`),

  /** Invalid init message format */
  invalidInitFormat: (name: string) =>
    new ProcwireError(`Module "${name}" sent invalid $init format (missing schema)`),

  /** Module error from child */
  moduleError: (name: string, message: string) =>
    new ProcwireError(`Module "${name}" error: ${message || "Unknown"}`),

  /** Schema validation failed - missing method */
  schemaMissingMethod: (name: string, method: string) =>
    new ProcwireError(`Module "${name}": child did not register expected method "${method}"`),

  /** Schema validation failed - missing event */
  schemaMissingEvent: (name: string, event: string) =>
    new ProcwireError(`Module "${name}": child did not register expected event "${event}"`),

  /** Data channel connection failed */
  dataChannelFailed: (message: string) =>
    new ProcwireError(`Data channel connect failed: ${message}`),

  /** Module process crashed */
  processCrashed: (name: string, exitCode: number | null, signal: string | null) =>
    new ProcwireError(
      `Module "${name}" process exited unexpectedly (code: ${exitCode}, signal: ${signal})`,
    ),

  /** Restart failed */
  restartFailed: (message: string) => new ProcwireError(`Restart failed: ${message}`),

  /** Too many restarts */
  tooManyRestarts: () => new ProcwireError("Too many restarts, giving up"),
} as const;
