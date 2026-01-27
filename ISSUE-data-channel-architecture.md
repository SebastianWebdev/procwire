# Data Channel Architecture Issue

## Problem Discovery

During implementation of the codec configuration fix for `WorkerChannel`, we discovered a **fundamental architectural issue** with the data channel design.

## Current Architecture (Broken)

```
Control Channel (stdio):
  Transport → Framing → JSON Codec → JSON-RPC Protocol → Application

Data Channel (named pipes):
  Transport → Framing → [Any Codec] → JSON-RPC Protocol → Application
                              ↑
                    THIS IS THE PROBLEM
```

### What's Wrong

1. **Data channel uses JSON-RPC protocol** - same as control channel
2. **Codecs serialize the entire JSON-RPC envelope**, not just user data:
   ```
   User sends: [1.0, 2.0, 3.0, ...] (embedding vector)
            ↓
   JSON-RPC wraps: {jsonrpc: "2.0", method: "insert", params: [...], id: 1}
            ↓
   MessagePack serializes the WHOLE wrapper (inefficient!)
   ```
3. **RawCodec is completely unusable** - it expects `Buffer` input but receives JavaScript objects from JSON-RPC

### Evidence from Benchmarks

| Transport | Codec | Throughput | Expected |
|-----------|-------|------------|----------|
| stdio | JSON | 169 MB/s | baseline |
| Named Pipes | MessagePack | 176 MB/s | ~500 MB/s |
| Named Pipes | Raw Binary | **BROKEN** | >500 MB/s |

MessagePack over pipes is barely faster than JSON over stdio because it's serializing JSON-RPC overhead, not raw data.

## Intended Architecture

```
Control Channel (stdio):
  - JSON-RPC Protocol (always)
  - JSON Codec (always)
  - Purpose: handshake, heartbeat, shutdown, method calls

Data Channel (named pipes):
  - NO JSON-RPC wrapper!
  - Direct codec: MessagePack / Protobuf / Arrow / Raw
  - Purpose: bulk data transfer, embeddings, large payloads
```

### How It Should Work

**Control channel** (for RPC):
```
Manager: handle.request("insert_vectors", { count: 1000 })
  → JSON-RPC: {jsonrpc: "2.0", method: "insert_vectors", params: {count: 1000}, id: 1}
  → JSON encode → line-delimited → stdio

Worker: responds with acknowledgment
```

**Data channel** (for bulk data):
```
Manager: handle.sendData(arrowTable)  // or Buffer, or MessagePack-able object
  → Arrow/MessagePack/Raw encode (NO JSON-RPC!)
  → length-prefixed → named pipe

Worker: receives raw decoded data directly
```

## Use Case Example

Vector database worker in Rust:

```typescript
// Manager side
const embeddings = new Float32Array(1000 * 768); // 1000 vectors, 768 dims

// Control channel: RPC call
await handle.request("prepare_insert", { count: 1000 });

// Data channel: raw binary data
await handle.sendData(Buffer.from(embeddings.buffer));

// Control channel: RPC call
await handle.request("commit_insert");
```

```rust
// Worker side (Rust)
fn handle_data(data: &[u8]) {
    // Receives raw bytes directly - no JSON-RPC parsing!
    let embeddings: &[f32] = bytemuck::cast_slice(data);
    self.index.insert(embeddings);
}
```

## Required Changes

### 1. New Data Channel API

```typescript
// SDK types
interface DataChannelOptions {
  serialization?: SerializationCodec;
  // NO protocol option - data channel doesn't use protocols
}

// Worker API
worker.onData((data: Buffer | T, context) => {
  // Receives decoded data directly
});

worker.sendData(data: Buffer | T): Promise<void>;

// Manager API
handle.sendData(data: Buffer | T): Promise<void>;
handle.onData((data: Buffer | T) => void);
```

### 2. Simplified Data Channel Implementation

- Remove JSON-RPC handling from data channel
- Direct: `codec.serialize(userData)` → transport
- Direct: transport → `codec.deserialize()` → user callback

### 3. Keep Control Channel As-Is

- JSON-RPC protocol stays for control channel
- Used for: handshake, heartbeat, shutdown, method invocations

## Files Affected

- `packages/procwire-sdk/src/channel/worker-channel.ts` - needs data-only mode
- `packages/procwire-sdk/src/worker-impl.ts` - new `onData`/`sendData` API
- `packages/procwire-sdk/src/types.ts` - new types for data channel
- `packages/transport/src/process/manager.ts` - manager-side data API
- `packages/transport/src/process/handle.ts` - `sendData`/`onData` methods

## Current Fix (Temporary)

The fix implemented in this commit:
- Makes `WorkerChannel` accept configurable `SerializationCodec`
- Passes codec config from manager to worker via `PROCWIRE_DATA_CODEC` env var
- **Still uses JSON-RPC** - so MessagePack/Protobuf serialize the JSON-RPC wrapper

This is a **partial fix** that enables codec configuration to flow correctly, but doesn't solve the fundamental issue of JSON-RPC overhead on the data channel.

## Priority

**HIGH** - Without this fix, the data channel offers no real performance benefit over the control channel. The entire purpose of having a separate data channel is defeated.
