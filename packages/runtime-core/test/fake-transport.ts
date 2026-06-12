/**
 * FakeTransport - an in-memory FrameTransport for testing the shared cores
 * without any runtime socket. Records written frames (re-parsed through a
 * real FrameBuffer so framing is validated) and counts pause/resume/close.
 */
import { FrameBuffer, type Frame, type FrameTransport } from "@procwire/protocol";

export class FakeTransport implements FrameTransport {
  /** Frames as parsed back from the written bytes. */
  readonly frames: Frame[] = [];
  /** Raw write calls (header+payload pairs). */
  readonly writes: { header: Buffer; payload: Buffer }[] = [];
  pauseCount = 0;
  resumeCount = 0;
  closeCount = 0;
  /** When set, writeFrame rejects with this error. */
  failWith: Error | null = null;

  private readonly _parser = new FrameBuffer();

  writeFrame(header: Buffer, payload: Buffer): Promise<void> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.writes.push({ header: Buffer.from(header), payload: Buffer.from(payload) });
    for (const frame of this._parser.push(Buffer.concat([header, payload]))) {
      this.frames.push(frame);
    }
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCount++;
  }

  resume(): void {
    this.resumeCount++;
  }

  close(): void {
    this.closeCount++;
  }
}
