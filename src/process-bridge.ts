import { ControlChannel } from "./channels/control";
import { DataChannel } from "./channels/data";
import { BridgeConfig } from "./types";

export class ProcessBridge {
  public readonly control: ControlChannel;
  public readonly data?: DataChannel;

  constructor(
    private id: string,
    private config: BridgeConfig,
  ) {
    this.control = new ControlChannel(config);

    if (config.pipeConfig) {
      this.data = new DataChannel(id, config);
    }
  }

  /**
   * Uruchamia proces i (opcjonalnie) serwer pipe.
   * Nie wykonuje automatycznego handshake'u - to zależy od użytkownika.
   */
  public async start(): Promise<void> {
    // 1. Start Pipe Server (jeśli skonfigurowany)
    if (this.data) {
      await this.data.listen();
    }

    // 2. Start Process
    await this.control.spawn();
  }

  /**
   * Helper do wykonania standardowego handshake'u.
   * Użytkownik może to pominąć i zrobić handshake ręcznie via `control.sendRequest`.
   */
  public async performHandshake(methodName: string = "initialize"): Promise<boolean> {
    if (!this.data) return true;

    const info = this.data.connectionInfo;

    // Wysyłamy do procesu info: "Hej, tu masz pipe'a, podłącz się"
    const result = await this.control.sendRequest<{ pipePath: string; protocol: string }, { connected: boolean }>(
      methodName,
      { pipePath: info.path, protocol: info.protocol },
    );

    if (result.connected) {
      // Czekamy na fizyczne połączenie socketu
      if (!this.data["socket"]) {
        await new Promise<void>((resolve) => this.data!.once("connected", resolve));
      }
      return true;
    }
    return false;
  }

  public async stop() {
    await this.data?.close();
    this.control.kill();
  }
}
