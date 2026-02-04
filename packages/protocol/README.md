# @procwire/protocol

Binary wire format for Procwire data plane - zero JSON overhead.

## Highlights

- **11-byte binary header** - minimal overhead
- **~80x performance** vs JSON-RPC on data plane
- **~2.5 GB/s throughput** on named pipes
- **Zero runtime dependencies**
- **Backpressure support** via DrainWaiter singleton

## Architecture

Procwire uses a dual-channel architecture:

| Channel | Transport | Format | Purpose |
|---------|-----------|--------|---------|
| Control Plane | stdio | JSON-RPC 2.0 | Handshake, heartbeat, lifecycle |
| Data Plane | Named Pipe | **BINARY** | User data, high throughput |

This package provides the **binary protocol for the Data Plane**.

## Wire Format

```
┌──────────┬───────┬──────────┬──────────┬──────────────────────┐
│ Method ID│ Flags │ Req ID   │ Length   │ Payload              │
│ 2 bytes  │ 1 byte│ 4 bytes  │ 4 bytes  │ N bytes              │
│ uint16 BE│       │ uint32 BE│ uint32 BE│ (codec output)       │
└──────────┴───────┴──────────┴──────────┴──────────────────────┘

Header: 11 bytes (fixed)
Payload: N bytes (variable, serialized by codec)
```

## Flags Byte

| Bit | Flag | Values |
|-----|------|--------|
| 0 | `DIRECTION_TO_PARENT` | 0 = to child, 1 = to parent |
| 1 | `IS_RESPONSE` | 0 = request/event, 1 = response |
| 2 | `IS_ERROR` | 0 = ok, 1 = error response |
| 3 | `IS_STREAM` | 0 = single message, 1 = stream chunk |
| 4 | `STREAM_END` | 0 = more coming, 1 = final chunk |
| 5 | `IS_ACK` | 0 = full response, 1 = ack only |
| 6-7 | Reserved | Must be 0 |

## Installation

```bash
npm install @procwire/protocol
```

**Requirements:** Node.js >= 22

## Quick Start

```typescript
import {
  encodeHeader,
  decodeHeader,
  createFlags,
  hasFlag,
  Flags,
  HEADER_SIZE,
} from "@procwire/protocol";

// Encode a request header
const header = encodeHeader({
  methodId: 1,
  flags: createFlags({ toParent: false }),
  requestId: 42,
  payloadLength: 1024,
});

// Decode received header
const decoded = decodeHeader(buffer);
if (hasFlag(decoded.flags, Flags.IS_STREAM)) {
  // handle stream chunk
}
```

## API Reference

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `HEADER_SIZE` | 11 | Header size in bytes |
| `DEFAULT_MAX_PAYLOAD_SIZE` | 1 GB | Default max payload |
| `ABSOLUTE_MAX_PAYLOAD_SIZE` | ~2 GB | Node.js Buffer limit |
| `ABORT_METHOD_ID` | 0xFFFF | Reserved for cancellation |
| `HEADER_POOL_SIZE` | 16 | Ring buffer pool size |

### Functions

#### `encodeHeader(header: FrameHeader): Buffer`

Encode a frame header into an 11-byte buffer.

#### `encodeHeaderInto(buffer: Buffer, header: FrameHeader): void`

Encode into an existing buffer (zero allocation for high-throughput).

#### `decodeHeader(buffer: Buffer): FrameHeader`

Decode an 11-byte buffer into a FrameHeader object.

#### `createFlags(options): number`

Build flags byte from options object.

```typescript
const flags = createFlags({
  toParent: true,
  isResponse: true,
  isStream: true,
  streamEnd: false,
});
```

#### `hasFlag(flags: number, flag: number): boolean`

Check if a specific flag is set.

#### `validateHeader(header: FrameHeader, maxPayloadSize?: number): void`

Validate header values. Throws on invalid values.

### Classes

#### `FrameBuffer`

Accumulates incoming TCP data into complete frames.

- **Batch mode** (default): Returns `Frame[]` when complete frames are available
- **Streaming mode**: Delivers payload chunks via callbacks for large payloads

```typescript
const frameBuffer = new FrameBuffer({ maxPayloadSize: 100 * 1024 * 1024 });

socket.on("data", (chunk) => {
  const frames = frameBuffer.push(chunk);
  for (const frame of frames) {
    handleFrame(frame);
  }
});
```

#### `Frame`

Parsed frame with header and payload.

```typescript
interface Frame {
  header: FrameHeader;
  payloadChunks: readonly Buffer[];  // Zero-copy chunks
  payload: Buffer;                   // Merged (may allocate)
  payloadLength: number;
}
```

#### `DrainWaiter`

Singleton for socket backpressure management. Prevents `MaxListenersExceededWarning` when multiple concurrent requests wait for drain.

```typescript
const drainWaiter = new DrainWaiter(socket);

if (socket.writableNeedDrain) {
  await drainWaiter.waitForDrain();
}
socket.write(data);
```

### Frame Building Utilities

#### `buildFrame(header: FrameHeader, payload: Buffer): Buffer`

Build a single buffer containing header + payload.

#### `buildFrameBuffers(header: FrameHeader, payload: Buffer): [Buffer, Buffer]`

Build separate header and payload buffers for `socket.cork()` / `writev()`.

## License

MIT
