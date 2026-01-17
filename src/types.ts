import { ChildProcess } from "child_process";

// === Configuration ===
export interface BridgeConfig {
  /** Ścieżka do pliku wykonywalnego (node, rust binary, python script) */
  executablePath: string;
  /** Argumenty dla procesu */
  args?: string[];
  /** Zmienne środowiskowe */
  env?: NodeJS.ProcessEnv;
  /** Katalog roboczy */
  cwd?: string;

  /** Konfiguracja nazewnictwa Pipe'ów (wymagana, jeśli używasz Data Channel) */
  pipeConfig?: {
    /** Funkcja generująca nazwę/ścieżkę pipe'a. Daje pełną kontrolę użytkownikowi. */
    nameGenerator: (id: string) => string;
    /** Czy automatycznie usuwać plik socketu po zamknięciu (Unix) */
    unlinkOnExit?: boolean;
  };

  /** Opcjonalna strategia serializacji dla Data Channel */
  dataStrategy?: IDataCodec;
}

// === Data Channel Codec (Strategy Pattern) ===
export interface IDataCodec<TIn = any, TOut = any> {
  /** Unikalny identyfikator protokołu (np. "arrow-v1", "protobuf-custom") */
  readonly protocolId: string;
  encode(data: TIn): Buffer;
  decode(buffer: Buffer): TOut;
}

// === JSON-RPC Types (Control Channel) ===
export interface JsonRpcRequest<T = any> {
  jsonrpc: "2.0";
  method: string;
  params?: T;
  id?: number | string;
}

export interface JsonRpcResponse<R = any> {
  jsonrpc: "2.0";
  result?: R;
  error?: { code: number; message: string; data?: any };
  id: number | string;
}
