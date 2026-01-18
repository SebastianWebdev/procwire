export interface FramingCodec {
  readonly name: string;
  encode(payload: Buffer): Buffer;
  decode(chunk: Buffer): Buffer[];
  reset(): void;
  hasBufferedData(): boolean;
}
