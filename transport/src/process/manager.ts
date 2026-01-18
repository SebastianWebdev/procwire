import type {
  ProcessManager as IProcessManager,
  ProcessManagerConfig,
  ProcessManagerEvents,
  SpawnOptions,
  RestartPolicy,
  ChannelConfig,
} from "./types.js";
import type { ProcessHandle as IProcessHandle } from "./types.js";
import type { Unsubscribe } from "../utils/disposables.js";
import { ProcessHandle } from "./handle.js";
import { EventEmitter } from "../utils/events.js";
import { StdioTransport } from "../transport/stdio-transport.js";
import type { StdioTransportOptions } from "../transport/stdio-transport.js";
import { SocketTransport } from "../transport/socket-transport.js";
import { ChannelBuilder } from "../channel/builder.js";
import { LineDelimitedFraming } from "../framing/line-delimited.js";
import { LengthPrefixedFraming } from "../framing/length-prefixed.js";
import { JsonCodec } from "../serialization/json.js";
import { RawCodec } from "../serialization/raw.js";
import { JsonRpcProtocol } from "../protocol/jsonrpc.js";
import { SimpleProtocol } from "../protocol/simple.js";
import { PipePath } from "../utils/pipe-path.js";
import { sleep } from "../utils/time.js";
import type { Transport } from "../transport/types.js";
import type { Channel } from "../channel/types.js";

/**
 * Internal managed process state.
 */
interface ManagedProcess {
  handle: ProcessHandle;
  transport: StdioTransport;
  options: SpawnOptions;
  restartAttempt: number;
  manualStop: boolean;
  restartPolicy: RestartPolicy;
}

/**
 * Process manager implementation.
 * Manages the lifecycle of multiple child processes with restart capability.
 */
export class ProcessManager implements IProcessManager {
  private readonly config: Required<ProcessManagerConfig>;
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly events = new EventEmitter<ProcessManagerEvents>();

  constructor(config: ProcessManagerConfig = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000,
      restartPolicy: config.restartPolicy ?? {
        enabled: false,
        maxRestarts: 3,
        backoffMs: 1000,
        maxBackoffMs: 30000,
      },
      namespace: config.namespace ?? "aspect-ipc",
      gracefulShutdownMs: config.gracefulShutdownMs ?? 5000,
    };
  }

  /**
   * Spawns a new managed process.
   */
  async spawn(id: string, options: SpawnOptions): Promise<IProcessHandle> {
    if (this.processes.has(id)) {
      throw new Error(`Process with ID '${id}' already exists`);
    }

    const restartPolicy = options.restartPolicy ?? this.config.restartPolicy;

    // Create stdio transport
    const transportOptions: StdioTransportOptions = {
      executablePath: options.executablePath,
      startupTimeout: options.startupTimeout ?? 10000,
    };
    if (options.args !== undefined) {
      transportOptions.args = options.args;
    }
    if (options.cwd !== undefined) {
      transportOptions.cwd = options.cwd;
    }
    if (options.env !== undefined) {
      transportOptions.env = options.env;
    }
    const transport = new StdioTransport(transportOptions);

    // Build control channel (stdio-based)
    const controlChannel = await this.buildControlChannel(transport, options.controlChannel);

    // Build data channel if enabled
    let dataChannel: Channel | null = null;
    if (options.dataChannel?.enabled) {
      const dataPath =
        options.dataChannel.path ?? PipePath.forModule(this.config.namespace, id);
      dataChannel = await this.buildDataChannel(dataPath, options.dataChannel.channel);
    }

    // Create handle
    const handle = new ProcessHandle(id, null, controlChannel, dataChannel);

    // Store managed process
    const managed: ManagedProcess = {
      handle,
      transport,
      options,
      restartAttempt: 0,
      manualStop: false,
      restartPolicy,
    };

    this.processes.set(id, managed);

    // Setup process lifecycle listeners
    transport.on("exit", ({ code, signal }) => {
      this.handleProcessExit(id, code, signal);
    });

    transport.on("error", (error) => {
      this.events.emit("error", { id, error });
      handle.emitError(error);
    });

    // Start transport and channels
    try {
      await transport.connect();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pid = (transport as any).process?.pid ?? null;
      handle.setPid(pid);

      await controlChannel.start();

      if (dataChannel) {
        await dataChannel.start();
      }

      handle.setState("running");
      this.events.emit("spawn", { id, pid: pid ?? 0 });
      this.events.emit("ready", { id });
    } catch (error) {
      // Cleanup on failure
      this.processes.delete(id);
      await this.cleanupProcess(managed);
      throw error;
    }

    return handle;
  }

  /**
   * Terminates a managed process.
   */
  async terminate(id: string): Promise<void> {
    const managed = this.processes.get(id);
    if (!managed) {
      throw new Error(`Process '${id}' not found`);
    }

    managed.manualStop = true;
    managed.handle.setState("stopping");

    await this.cleanupProcess(managed);
    this.processes.delete(id);

    managed.handle.setState("stopped");
  }

  /**
   * Terminates all managed processes.
   */
  async terminateAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const id of this.processes.keys()) {
      promises.push(this.terminate(id));
    }
    await Promise.all(promises);
  }

  /**
   * Gets a process handle by ID.
   */
  getHandle(id: string): IProcessHandle | null {
    return this.processes.get(id)?.handle ?? null;
  }

  /**
   * Checks if a process is running.
   */
  isRunning(id: string): boolean {
    const managed = this.processes.get(id);
    return managed !== undefined && managed.handle.state === "running";
  }

  /**
   * Subscribes to manager events.
   */
  on<K extends keyof ProcessManagerEvents>(
    event: K,
    handler: (data: ProcessManagerEvents[K]) => void,
  ): Unsubscribe {
    return this.events.on(event, handler);
  }

  /**
   * Handles process exit event.
   */
  private async handleProcessExit(
    id: string,
    code: number | null,
    signal: string | null,
  ): Promise<void> {
    const managed = this.processes.get(id);
    if (!managed) {
      return;
    }

    this.events.emit("exit", { id, code, signal });
    managed.handle.emitExit(code, signal);

    // Check if we should restart
    const shouldRestart =
      !managed.manualStop &&
      managed.restartPolicy.enabled &&
      managed.restartAttempt < managed.restartPolicy.maxRestarts &&
      (code !== 0 || signal !== null);

    if (shouldRestart) {
      // Calculate backoff delay
      const baseDelay = managed.restartPolicy.backoffMs;
      const maxDelay = managed.restartPolicy.maxBackoffMs ?? Infinity;
      const delay = Math.min(baseDelay * Math.pow(2, managed.restartAttempt), maxDelay);

      managed.restartAttempt++;
      managed.handle.setState("crashed");

      this.events.emit("restart", {
        id,
        attempt: managed.restartAttempt,
        delayMs: delay,
      });

      // Wait backoff delay
      await sleep(delay);

      // Attempt restart
      try {
        await this.restartProcess(id);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.events.emit("crash", { id, error: err });
        managed.handle.setState("error");
        managed.handle.emitError(err);
      }
    } else {
      // No restart - mark as crashed or stopped
      if (managed.manualStop || code === 0) {
        managed.handle.setState("stopped");
      } else {
        managed.handle.setState("crashed");
        const error = new Error(
          `Process exited with code ${code} and signal ${signal}`,
        );
        this.events.emit("crash", { id, error });
      }

      // Cleanup
      await this.cleanupProcess(managed);
      this.processes.delete(id);
    }
  }

  /**
   * Restarts a crashed process.
   */
  private async restartProcess(id: string): Promise<void> {
    const managed = this.processes.get(id);
    if (!managed) {
      throw new Error(`Process '${id}' not found`);
    }

    // Cleanup old resources
    await this.cleanupProcess(managed);

    // Create new transport
    const transportOptions: StdioTransportOptions = {
      executablePath: managed.options.executablePath,
      startupTimeout: managed.options.startupTimeout ?? 10000,
    };
    if (managed.options.args !== undefined) {
      transportOptions.args = managed.options.args;
    }
    if (managed.options.cwd !== undefined) {
      transportOptions.cwd = managed.options.cwd;
    }
    if (managed.options.env !== undefined) {
      transportOptions.env = managed.options.env;
    }
    const transport = new StdioTransport(transportOptions);

    // Build new control channel
    const controlChannel = await this.buildControlChannel(
      transport,
      managed.options.controlChannel,
    );

    // Build new data channel if needed
    let dataChannel: Channel | null = null;
    if (managed.options.dataChannel?.enabled) {
      const dataPath =
        managed.options.dataChannel.path ?? PipePath.forModule(this.config.namespace, id);
      dataChannel = await this.buildDataChannel(
        dataPath,
        managed.options.dataChannel.channel,
      );
    }

    // Update handle
    const oldHandle = managed.handle;
    const newHandle = new ProcessHandle(id, null, controlChannel, dataChannel);
    managed.handle = newHandle;
    managed.transport = transport;

    // Setup listeners
    transport.on("exit", ({ code, signal }) => {
      this.handleProcessExit(id, code, signal);
    });

    transport.on("error", (error) => {
      this.events.emit("error", { id, error });
      newHandle.emitError(error);
    });

    // Start
    await transport.connect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pid = (transport as any).process?.pid ?? null;
    newHandle.setPid(pid);

    await controlChannel.start();

    if (dataChannel) {
      await dataChannel.start();
    }

    newHandle.setState("running");
    this.events.emit("spawn", { id, pid: pid ?? 0 });
    this.events.emit("ready", { id });

    // Close old handle
    await oldHandle.close().catch(() => {});
  }

  /**
   * Cleans up process resources.
   */
  private async cleanupProcess(managed: ManagedProcess): Promise<void> {
    // Close channels
    await managed.handle.close().catch(() => {});

    // Terminate transport
    try {
      await managed.transport.disconnect();
    } catch {
      // Force kill if graceful shutdown fails
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childProcess = (managed.transport as any).process;
      if (childProcess && !childProcess.killed) {
        childProcess.kill("SIGKILL");
      }
    }
  }

  /**
   * Builds control channel from stdio transport.
   */
  private async buildControlChannel(
    transport: Transport,
    config?: ChannelConfig,
  ): Promise<Channel> {
    const framing =
      config?.framing === "length-prefixed"
        ? new LengthPrefixedFraming()
        : typeof config?.framing === "object"
          ? config.framing
          : new LineDelimitedFraming();

    const serialization =
      config?.serialization === "raw"
        ? new RawCodec()
        : typeof config?.serialization === "object"
          ? config.serialization
          : new JsonCodec();

    const protocol =
      config?.protocol === "simple"
        ? new SimpleProtocol()
        : typeof config?.protocol === "object"
          ? config.protocol
          : new JsonRpcProtocol();

    const builder = new ChannelBuilder()
      .withTransport(transport)
      .withFraming(framing)
      .withSerialization(serialization)
      .withProtocol(protocol);

    if (config?.timeoutMs !== undefined) {
      builder.withTimeout(config.timeoutMs);
    } else {
      builder.withTimeout(this.config.defaultTimeout);
    }

    if (config?.responseAccessor !== undefined) {
      builder.withResponseAccessor(config.responseAccessor);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return builder.build() as any;
  }

  /**
   * Builds data channel from pipe transport.
   */
  private async buildDataChannel(path: string, config?: ChannelConfig): Promise<Channel> {
    const transport = new SocketTransport({ path });

    const framing =
      config?.framing === "line-delimited"
        ? new LineDelimitedFraming()
        : typeof config?.framing === "object"
          ? config.framing
          : new LengthPrefixedFraming();

    const serialization =
      config?.serialization === "raw"
        ? new RawCodec()
        : typeof config?.serialization === "object"
          ? config.serialization
          : new JsonCodec();

    const protocol =
      config?.protocol === "simple"
        ? new SimpleProtocol()
        : typeof config?.protocol === "object"
          ? config.protocol
          : new JsonRpcProtocol();

    const builder = new ChannelBuilder()
      .withTransport(transport)
      .withFraming(framing)
      .withSerialization(serialization)
      .withProtocol(protocol);

    if (config?.timeoutMs !== undefined) {
      builder.withTimeout(config.timeoutMs);
    } else {
      builder.withTimeout(this.config.defaultTimeout);
    }

    if (config?.responseAccessor !== undefined) {
      builder.withResponseAccessor(config.responseAccessor);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return builder.build() as any;
  }
}
