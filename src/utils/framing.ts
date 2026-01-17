import { Transform, TransformCallback } from "stream";

export class LengthPrefixedEncoder {
  encode(payload: Buffer): Buffer {
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(payload.length, 0);
    return Buffer.concat([lengthBuf, payload]);
  }
}

export class LengthPrefixedDecoder extends Transform {
  private buffer: Buffer = Buffer.alloc(0);

  _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length >= 4 + length) {
        this.push(this.buffer.subarray(4, 4 + length));
        this.buffer = this.buffer.subarray(4 + length);
      } else {
        break;
      }
    }
    callback();
  }
}
