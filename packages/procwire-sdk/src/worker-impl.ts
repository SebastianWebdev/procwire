/**
 * Worker implementation
 */

import type {
  Worker,
  WorkerOptions,
  WorkerState,
  WorkerHooks,
  Handler,
  NotificationHandler,
  HandlerContext,
} from "./types.js";
import { HandlerRegistry } from "./handlers/registry.js";
import { StdioWorkerTransport } from "./transport/stdio-worker.js";
import { SocketServer } from "./transport/socket-server.js";
import { WorkerChannel } from "./channel/worker-channel.js";
import { resolveWorkerOptions } from "./utils/options.js";
import { createLogger, type Logger } from "./utils/logger.js";
import { createCodecByName, ENV_DATA_CODEC } from "./utils/codec-factory.js";
import {
  ReservedMethods,
  isReservedMethod,
  createHandshakeResponse,
  validateHandshakeParams,
  createHeartbeatPong,
  validateHeartbeatPingParams,
  createShutdownResponse,
  createShutdownCompleteParams,
  validateShutdownParams,
  type HandshakeParams,
  type HeartbeatPingParams,
  type ShutdownParams,
} from "./protocol/index.js";

/**
 * Worker implementation class.
 * @internal
 */
export class WorkerImpl implements Worker {
  private readonly options: ReturnType<typeof resolveWorkerOptions>;
  private readonly logger: Logger;
  private readonly handlers: HandlerRegistry;
  private hooks_: WorkerHooks = {};

  private controlChannel: WorkerChannel | null = null;
  private dataChannel: WorkerChannel | null = null;
  private socketServer: SocketServer | null = null;

  private _state: WorkerState = "created";
  private pendingRequests = 0;
  private shutdownExitCode: number | null = null;
  private shutdownResolve: (() => void) | null = null;

  constructor(options: WorkerOptions = {}) {
    this.options = resolveWorkerOptions(options);
    this.logger = createLogger(this.options.name, this.options.debug);
    this.handlers = new HandlerRegistry();
  }

  get state(): WorkerState {
    return this._state;
  }

  handle<TParams, TResult>(method: string, handler: Handler<TParams, TResult>): this {
    this.handlers.register(method, handler as Handler);
    this.logger.debug(`Registered handler for '${method}'`);
    return this;
  }

  onNotification<TParams>(method: string, handler: NotificationHandler<TParams>): this {
    this.handlers.registerNotification(method, handler as NotificationHandler);
    this.logger.debug(`Registered notification handler for '${method}'`);
    return this;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.controlChannel) {
      throw new Error("Worker not started");
    }
    await this.controlChannel.notify(method, params);
  }

  hooks(hooks: WorkerHooks): this {
    this.hooks_ = { ...this.hooks_, ...hooks };
    return this;
  }

  async start(): Promise<void> {
    if (this._state !== "created") {
      throw new Error(`Cannot start worker in state '${this._state}'`);
    }

    this._state = "starting";
    this.logger.info("Starting worker...");

    try {
      // 1. Setup control channel (stdio)
      await this.setupControlChannel();

      // 2. Setup data channel if configured
      if (this.options.dataChannel) {
        await this.setupDataChannel();
      }

      // 3. Wait for handshake
      this._state = "handshaking";
      this.logger.debug("Waiting for handshake...");

      // 4. Worker is now ready (state set in handleHandshake)
      // Block until shutdown
      await new Promise<void>((resolve) => {
        this.shutdownResolve = resolve;
      });

      // 5. Cleanup
      await this.cleanup();

      // 6. Exit with code
      process.exit(this.shutdownExitCode ?? 0);
    } catch (error) {
      this._state = "stopped";
      this.hooks_.onError?.(error as Error);
      this.logger.error("Worker failed:", error);
      throw error;
    }
  }

  async shutdown(exitCode = 0): Promise<void> {
    if (this._state === "stopped" || this._state === "draining") {
      return;
    }

    this._state = "draining";
    this.shutdownExitCode = exitCode;
    this.logger.info(`Shutdown requested (exit code: ${exitCode})`);

    // Drain pending requests
    await this.drainPendingRequests();

    // Send __shutdown_complete__
    if (this.controlChannel) {
      try {
        await this.controlChannel.notify(
          ReservedMethods.SHUTDOWN_COMPLETE,
          createShutdownCompleteParams(exitCode),
        );
      } catch (error) {
        this.logger.warn("Failed to send shutdown complete:", error);
      }
    }

    this._state = "stopped";
    this.shutdownResolve?.();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Setup
  // ─────────────────────────────────────────────────────────────────────────

  private async setupControlChannel(): Promise<void> {
    const transport = new StdioWorkerTransport();

    this.controlChannel = new WorkerChannel({
      transport,
      framing: "line-delimited",
      logger: this.logger,
      onRequest: (method, params, id) => this.handleRequest(method, params, id, "control"),
      onNotification: (method, params) => this.handleNotification(method, params),
    });

    await this.controlChannel.start();
    this.logger.debug("Control channel ready");
  }

  private async setupDataChannel(): Promise<void> {
    const dataPath = process.env.PROCWIRE_DATA_PATH;
    if (!dataPath) {
      this.logger.warn("PROCWIRE_DATA_PATH not set, skipping data channel");
      return;
    }

    // Determine serialization codec
    // Priority: 1. options.dataChannel.serialization, 2. env var, 3. default (JSON)
    let serialization = this.options.dataChannel?.serialization;

    if (!serialization) {
      const codecName = process.env[ENV_DATA_CODEC];
      if (codecName) {
        this.logger.debug(`Using codec from environment: ${codecName}`);
        serialization = createCodecByName(codecName);
      }
    }

    // Create socket server
    this.socketServer = new SocketServer();
    await this.socketServer.listen(dataPath);
    this.logger.debug(`Data channel listening on ${dataPath}`);

    // Notify manager that data channel is ready
    await this.controlChannel!.notify(ReservedMethods.DATA_CHANNEL_READY, {
      path: dataPath,
    });

    // Wait for manager to connect
    const clientTransport = await this.socketServer.waitForConnection();
    this.logger.debug("Manager connected to data channel");

    // Build data channel with configured serialization
    this.dataChannel = new WorkerChannel({
      transport: clientTransport,
      framing: "length-prefixed",
      logger: this.logger,
      onRequest: (method, params, id) => this.handleRequest(method, params, id, "data"),
      onNotification: (method, params) => this.handleNotification(method, params),
      ...(serialization && { serialization }),
    });

    await this.dataChannel.start();
    this.logger.debug("Data channel ready");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Request Handling
  // ─────────────────────────────────────────────────────────────────────────

  private async handleRequest(
    method: string,
    params: unknown,
    id: string | number,
    channel: "control" | "data",
  ): Promise<unknown> {
    this.logger.debug(`Request: ${method} (id: ${id}, channel: ${channel})`);

    // Handle reserved methods
    if (isReservedMethod(method)) {
      return this.handleReservedMethod(method, params);
    }

    // Handle user methods
    const handler = this.handlers.get(method);
    if (!handler) {
      throw new Error(`Method not found: ${method}`);
    }

    const context: HandlerContext = {
      requestId: id,
      method,
      channel,
      signal: new AbortController().signal, // TODO: proper cancellation
    };

    this.pendingRequests++;
    try {
      return await handler(params, context);
    } finally {
      this.pendingRequests--;
    }
  }

  private async handleNotification(method: string, params: unknown): Promise<void> {
    this.logger.debug(`Notification: ${method}`);

    // Handle reserved notifications
    if (method === ReservedMethods.HEARTBEAT_PING) {
      await this.handleHeartbeatPing(params);
      return;
    }

    // Handle user notifications
    const handler = this.handlers.getNotification(method);
    if (handler) {
      await handler(params);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Reserved Method Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async handleReservedMethod(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case ReservedMethods.HANDSHAKE:
        return this.handleHandshake(params);
      case ReservedMethods.SHUTDOWN:
        return this.handleShutdownRequest(params);
      default:
        throw new Error(`Unknown reserved method: ${method}`);
    }
  }

  private handleHandshake(params: unknown): unknown {
    validateHandshakeParams(params);
    const handshakeParams = params as HandshakeParams;

    this.logger.debug("Handshake received:", handshakeParams);

    // Update state to ready
    this._state = "ready";

    // Call onReady hook (async, don't await)
    Promise.resolve(this.hooks_.onReady?.()).catch((error) => {
      this.logger.error("onReady hook error:", error);
    });

    this.logger.info("Worker ready");

    return createHandshakeResponse(handshakeParams, this.options);
  }

  private async handleHeartbeatPing(params: unknown): Promise<void> {
    validateHeartbeatPingParams(params);
    const pingParams = params as HeartbeatPingParams;

    const pong = createHeartbeatPong(pingParams, this.pendingRequests);
    await this.controlChannel!.notify(ReservedMethods.HEARTBEAT_PONG, pong);
  }

  private async handleShutdownRequest(params: unknown): Promise<unknown> {
    validateShutdownParams(params);
    const shutdownParams = params as ShutdownParams;

    this.logger.info(`Shutdown requested: ${shutdownParams.reason}`);

    // Call onShutdown hook
    try {
      await this.hooks_.onShutdown?.(shutdownParams.reason);
    } catch (error) {
      this.logger.error("onShutdown hook error:", error);
    }

    // Schedule shutdown (don't await - respond first)
    setImmediate(() => void this.shutdown(0));

    return createShutdownResponse(this.pendingRequests);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Utilities
  // ─────────────────────────────────────────────────────────────────────────

  private async drainPendingRequests(): Promise<void> {
    const startTime = Date.now();
    const timeout = this.options.drainTimeout;

    this.logger.debug(`Draining ${this.pendingRequests} pending requests...`);

    while (this.pendingRequests > 0) {
      if (Date.now() - startTime > timeout) {
        this.logger.warn(`Drain timeout, ${this.pendingRequests} requests still pending`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async cleanup(): Promise<void> {
    this.logger.debug("Cleaning up...");

    await this.controlChannel?.stop();
    await this.dataChannel?.stop();
    await this.socketServer?.close();
  }
}
