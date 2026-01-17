import * as net from "net";
import { EventEmitter } from "events";
import { BridgeConfig, IDataCodec } from "../types";
import { LengthPrefixedDecoder, LengthPrefixedEncoder } from "../utils/framing";

// Default strategy if none provided
class RawBufferStrategy implements IDataCodec<Buffer, Buffer> {
  protocolId = "raw";
  encode(d: Buffer) {
    return d;
  }
  decode(b: Buffer) {
    return b;
  }
}

export class DataChannel extends EventEmitter {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private pipePath: string;
  private strategy: IDataCodec;
  private encoder = new LengthPrefixedEncoder();

  constructor(
    private id: string,
    config: BridgeConfig,
  ) {
    super();
    if (!config.pipeConfig) throw new Error("Pipe config missing for Data Channel");

    this.pipePath = config.pipeConfig.nameGenerator(id);
    this.strategy = config.dataStrategy || new RawBufferStrategy();
  }

  public get connectionInfo() {
    return {
      path: this.pipePath,
      protocol: this.strategy.protocolId,
    };
  }

  public async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.socket = socket;

        // Pipeline: Socket -> LengthDecoder -> StrategyDecoder -> Event
        socket.pipe(new LengthPrefixedDecoder()).on("data", (frame: Buffer) => {
          try {
            const decoded = this.strategy.decode(frame);
            this.emit("data", decoded);
          } catch (e) {
            this.emit("error", e);
          }
        });

        this.emit("connected");
      });

      this.server.listen(this.pipePath, () => resolve());
      this.server.on("error", reject);
    });
  }

  public async send(data: any): Promise<void> {
    if (!this.socket) throw new Error("Client not connected to pipe");

    const encoded = this.strategy.encode(data);
    const framed = this.encoder.encode(encoded);

    return new Promise((resolve, reject) => {
      this.socket!.write(framed, (err) => (err ? reject(err) : resolve()));
    });
  }

  public async close() {
    this.socket?.destroy();
    this.server?.close();
  }
}
