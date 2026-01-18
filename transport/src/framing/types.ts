/**
 * Framing codec interface for message boundary detection in byte streams.
 * Implementations: line-delimited, length-prefixed, etc.
 */
export interface FramingCodec {
  /**
   * Encodes a message payload into a framed buffer.
   * @param payload - Raw message data
   * @returns Framed buffer ready for transmission
   */
  encode(payload: Buffer): Buffer;

  /**
   * Decodes incoming chunk and extracts complete messages.
   * May buffer partial data internally.
   *
   * @param chunk - Incoming data chunk
   * @returns Array of complete message payloads (may be empty if buffering)
   */
  decode(chunk: Buffer): Buffer[];

  /**
   * Resets internal decoder state and clears buffers.
   * Used for error recovery or connection restart.
   */
  reset(): void;

  /**
   * Returns true if decoder has buffered partial data.
   */
  hasBufferedData(): boolean;

  /**
   * Returns current buffer size (bytes).
   * Useful for monitoring and debugging.
   */
  getBufferSize(): number;
}
