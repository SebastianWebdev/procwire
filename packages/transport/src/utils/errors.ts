/**
 * Base error class for all Aspect IPC errors.
 */
export class AspectIpcError extends Error {
  public readonly code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Transport-layer error (connection, I/O, etc.)
 */
export class TransportError extends AspectIpcError {
  constructor(message: string, cause?: unknown) {
    super(message, "TRANSPORT_ERROR", cause);
  }
}

/**
 * Protocol-layer error (parsing, validation, etc.)
 */
export class ProtocolError extends AspectIpcError {
  constructor(message: string, cause?: unknown) {
    super(message, "PROTOCOL_ERROR", cause);
  }
}

/**
 * Timeout error (request timeout, connection timeout, etc.)
 */
export class TimeoutError extends AspectIpcError {
  constructor(message: string, cause?: unknown) {
    super(message, "TIMEOUT_ERROR", cause);
  }
}

/**
 * Serialization error (encode/decode failures)
 */
export class SerializationError extends AspectIpcError {
  constructor(message: string, cause?: unknown) {
    super(message, "SERIALIZATION_ERROR", cause);
  }
}

/**
 * Framing error (invalid frame format, buffer overflow, etc.)
 */
export class FramingError extends AspectIpcError {
  constructor(message: string, cause?: unknown) {
    super(message, "FRAMING_ERROR", cause);
  }
}

/**
 * Converts unknown value to Error instance.
 * Useful for catch blocks and error normalization.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string") {
    return new Error(value);
  }
  return new Error(String(value));
}
