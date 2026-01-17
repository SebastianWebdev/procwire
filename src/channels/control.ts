import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import * as readline from "readline";
import { BridgeConfig, JsonRpcRequest } from "../types";

export class ControlChannel extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestMap = new Map<number, { resolve: Function; reject: Function }>();
  private reqIdCounter = 0;

  constructor(private config: BridgeConfig) {
    super();
  }

  public async spawn(): Promise<void> {
    this.process = spawn(this.config.executablePath, this.config.args || [], {
      stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
      env: { ...process.env, ...this.config.env },
      cwd: this.config.cwd,
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error("Failed to spawn process with stdio pipes");
    }

    this.process.on("exit", (code) => this.emit("exit", code));
    this.process.stderr?.on("data", (d) => this.emit("stderr", d.toString()));

    // Line-based JSON-RPC reader
    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on("line", (line) => this.handleLine(line));
  }

  public sendRequest<T = any, R = any>(method: string, params?: T): Promise<R> {
    if (!this.process?.stdin) throw new Error("Process not running");

    const id = ++this.reqIdCounter;
    const msg: JsonRpcRequest<T> = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.requestMap.set(id, { resolve, reject });
      const data = JSON.stringify(msg) + "\n";
      this.process!.stdin!.write(data, (err) => {
        if (err) {
          this.requestMap.delete(id);
          reject(err);
        }
      });
    });
  }

  private handleLine(line: string) {
    try {
      const msg = JSON.parse(line);
      if (msg.id && (msg.result !== undefined || msg.error)) {
        const p = this.requestMap.get(msg.id);
        if (p) {
          msg.error ? p.reject(msg.error) : p.resolve(msg.result);
          this.requestMap.delete(msg.id);
        }
      } else if (msg.method) {
        this.emit("notification", msg.method, msg.params);
      }
    } catch (e) {
      this.emit("error", new Error(`Invalid JSON: ${line}`));
    }
  }

  public kill() {
    this.process?.kill();
  }
}
