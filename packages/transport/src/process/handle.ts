import type {
  ProcessHandle as IProcessHandle,
  ProcessHandleEvents,
  ProcessState,
} from "./types.js";
import type { Channel } from "../channel/types.js";
import type { Unsubscribe } from "../utils/disposables.js";
import { EventEmitter } from "../utils/events.js";

/**
 * Process handle implementation.
 * Encapsulates a managed process and its communication channels.
 */
export class ProcessHandle implements IProcessHandle {
  private readonly _id: string;
  private _pid: number | null;
  private _state: ProcessState;
  private readonly _controlChannel: Channel;
  private readonly _dataChannel: Channel | null;
  private readonly events = new EventEmitter<ProcessHandleEvents>();

  constructor(
    id: string,
    pid: number | null,
    controlChannel: Channel,
    dataChannel: Channel | null = null,
  ) {
    this._id = id;
    this._pid = pid;
    this._state = "starting";
    this._controlChannel = controlChannel;
    this._dataChannel = dataChannel;
  }

  get id(): string {
    return this._id;
  }

  get pid(): number | null {
    return this._pid;
  }

  get state(): ProcessState {
    return this._state;
  }

  get controlChannel(): Channel {
    return this._controlChannel;
  }

  get dataChannel(): Channel | null {
    return this._dataChannel;
  }

  /**
   * Updates process ID.
   * @internal Used by ProcessManager
   */
  setPid(pid: number | null): void {
    this._pid = pid;
  }

  /**
   * Updates process state and emits state change event.
   * @internal Used by ProcessManager
   */
  setState(newState: ProcessState): void {
    if (newState === this._state) {
      return;
    }

    const from = this._state;
    this._state = newState;
    this.events.emit("stateChange", { from, to: newState });
  }

  /**
   * Sends a request via control channel.
   */
  async request(method: string, params?: unknown, timeout?: number): Promise<unknown> {
    return this._controlChannel.request(method, params, timeout);
  }

  /**
   * Sends a notification via control channel.
   */
  async notify(method: string, params?: unknown): Promise<void> {
    return this._controlChannel.notify(method, params);
  }

  /**
   * Sends a request via data channel.
   * @throws {Error} if data channel is not available
   */
  async requestViaData(method: string, params?: unknown, timeout?: number): Promise<unknown> {
    if (!this._dataChannel) {
      throw new Error(`Data channel not available for process '${this._id}'`);
    }
    return this._dataChannel.request(method, params, timeout);
  }

  /**
   * Closes the handle and its channels.
   * Does not terminate the process.
   */
  async close(): Promise<void> {
    await Promise.all([
      this._controlChannel.close(),
      this._dataChannel ? this._dataChannel.close() : Promise.resolve(),
    ]);
  }

  /**
   * Subscribes to handle events.
   */
  on<K extends keyof ProcessHandleEvents>(
    event: K,
    handler: (data: ProcessHandleEvents[K]) => void,
  ): Unsubscribe {
    return this.events.on(event, handler);
  }

  /**
   * Emits an exit event.
   * @internal Used by ProcessManager
   */
  emitExit(code: number | null, signal: string | null): void {
    this.events.emit("exit", { code, signal });
  }

  /**
   * Emits an error event.
   * @internal Used by ProcessManager
   */
  emitError(error: Error): void {
    this.events.emit("error", error);
  }
}
