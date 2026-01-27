# Data Channel ignores serialization codec configuration - performance regression

## Summary

The data channel serialization codec configuration is **completely ignored** on the worker side, resulting in severe performance regression. All codecs (MessagePack, Protobuf, RawCodec) are affected.

## Evidence from Benchmarks

Our codec performance benchmark revealed shocking results:

| Transport   | Codec       | 1MB Throughput | Expected  |
| ----------- | ----------- | -------------- | --------- |
| stdio       | JSON        | **169 MB/s**   | baseline  |
| Named Pipes | Raw Binary  | **31 MB/s**    | >500 MB/s |
| Named Pipes | MessagePack | **176 MB/s**   | ~500 MB/s |
| Named Pipes | Protobuf    | **168 MB/s**   | ~500 MB/s |

**Raw Binary over Named Pipes is 5x SLOWER than JSON over stdio!** This is absurd - Named Pipes should be faster, and raw binary should have zero serialization overhead.

For comparison, **pure in-memory serialization** shows expected performance:

- MessagePack: **524 MB/s** (1MB payload)
- Protobuf: **955 MB/s** (1MB payload)
- Arrow: **4,409 MB/s** (100K rows)

This proves the bottleneck is NOT the codecs themselves, but the transport layer ignoring codec configuration.

## Root Cause Analysis

### Problem 1: SDK WorkerChannel has hardcoded JSON serialization

In `packages/procwire-sdk/src/channel/worker-channel.ts`:

```typescript
// Line 206 - HARDCODED JSON.parse!
private async handleMessage(data: Buffer): Promise<void> {
  const msg: unknown = JSON.parse(data.toString("utf8"));  // ← ignores codec
  // ...
}

// Line 258-259 - HARDCODED JSON.stringify!
private async send(msg: JsonRpcResponse | JsonRpcNotification): Promise<void> {
  const json = JSON.stringify(msg);  // ← ignores codec
  // ...
}
```

**The WorkerChannel completely ignores any serialization codec configuration!** Whether you configure MessagePack, Protobuf, or RawCodec - it always uses JSON.

### Problem 2: ProcessManager defaults to JsonRpcProtocol

In `packages/transport/src/process/manager.ts`:

```typescript
// Lines 618-630
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
      : new JsonRpcProtocol(); // ← ALWAYS defaults to JSON-RPC!
```

Even when you configure a binary codec, the protocol layer wraps everything in JSON-RPC:

```
User payload (binary)
    ↓
JsonRpcProtocol.createRequest()
    → {jsonrpc: "2.0", method: "...", params: <binary>, id: 1}
    ↓
SerializationCodec.serialize()
    → Serializes the ENTIRE JSON-RPC wrapper, not just the payload!
```

### The Double Problem

1. **Manager side**: Codec IS used, but it serializes the JSON-RPC wrapper (not efficient)
2. **Worker side**: Codec is COMPLETELY IGNORED - always JSON.parse/stringify

This creates an asymmetric situation where:

- Manager sends: MessagePack-encoded JSON-RPC message
- Worker expects: Plain JSON (because it always does JSON.parse)
- **Result**: Protocol mismatch or degraded performance

## Affected Codecs

| Codec            | Affected? | Impact                                        |
| ---------------- | --------- | --------------------------------------------- |
| RawCodec         | ✅ YES    | Useless - no benefit from "raw" mode          |
| MessagePackCodec | ✅ YES    | Serializes JSON-RPC wrapper instead of binary |
| ProtobufCodec    | ✅ YES    | Serializes JSON-RPC wrapper instead of binary |
| ArrowCodec       | ✅ YES    | Can't be used on data channel at all          |

## Expected Behavior

1. When `dataChannel.serialization` is configured, **both manager and worker** should use that codec
2. When RawCodec is used, the system should NOT wrap data in JSON-RPC
3. Data channel should support true binary transfer without JSON overhead

## Proposed Solution

### Option A: Make WorkerChannel respect codec configuration

```typescript
// WorkerChannel should accept serialization codec
constructor(options: {
  serialization?: SerializationCodec;
  protocol?: Protocol;
  // ...
}) {
  this.serialization = options.serialization ?? new JsonCodec();
  this.protocol = options.protocol ?? new JsonRpcProtocol();
}

private async handleMessage(data: Buffer): Promise<void> {
  const msg = this.serialization.deserialize(data);  // Use configured codec
  const parsed = this.protocol.parseMessage(msg);
  // ...
}

private async send(msg: JsonRpcResponse | JsonRpcNotification): Promise<void> {
  const serialized = this.serialization.serialize(msg);  // Use configured codec
  // ...
}
```

### Option B: Add "raw binary" mode without JSON-RPC

For maximum performance, add a mode that bypasses JSON-RPC entirely:

```typescript
const worker = createWorker({
  dataChannel: {
    serialization: new MessagePackCodec(),
    protocol: "binary", // No JSON-RPC wrapping
  },
});
```

## Naming Suggestion

Consider renaming `RawCodec` to `RawBinaryCodec` or `PassthroughCodec` to better indicate its purpose and avoid confusion with "raw JSON-RPC".

## Reproduction

Run the codec performance benchmark:

```bash
pnpm --filter integration-tests benchmark
```

Observe that Raw Pipe baseline shows worse performance than JSON/stdio baseline.

## Related Files

- `packages/procwire-sdk/src/channel/worker-channel.ts` - Hardcoded JSON
- `packages/transport/src/process/manager.ts` - buildDataChannel()
- `packages/integration-tests/benchmark/codec-performance.bench.ts` - Benchmark revealing the issue
- `packages/integration-tests/benchmark-reports/latest.md` - Benchmark results

## Priority

**HIGH** - This bug defeats the entire purpose of configurable serialization codecs on the data channel. Users expect binary codecs to improve performance, but they currently have no effect (or negative effect in case of RawCodec).
