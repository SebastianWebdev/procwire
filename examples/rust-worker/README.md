# Rust Worker IPC Example

Demonstrates **cross-language IPC** between Node.js and Rust:

- Node.js parent process
- Rust child worker
- Stdio communication with line-delimited JSON-RPC
- Language-agnostic protocol
- Performance-critical computations in Rust

## Architecture

```
┌────────────────────────────────────────────────┐
│ Node.js Parent (parent.ts)                     │
│ ┌────────────────────────────────────────────┐ │
│ │ createStdioChannel()                       │ │
│ │  • LineDelimitedFraming                    │ │
│ │  • JsonCodec                               │ │
│ │  • JsonRpcProtocol                         │ │
│ └────────────────────────────────────────────┘ │
└─────────────────┬──────────────────────────────┘
                  │ stdin/stdout
                  │ (line-delimited JSON-RPC 2.0)
┌─────────────────┴──────────────────────────────┐
│ Rust Worker (rust/src/main.rs)                 │
│ ┌────────────────────────────────────────────┐ │
│ │ Manual JSON-RPC 2.0 implementation         │ │
│ │  • serde_json for parsing                  │ │
│ │  • BufRead for line-delimited input        │ │
│ │  • println! for line-delimited output      │ │
│ │  • Native Rust handlers                    │ │
│ └────────────────────────────────────────────┘ │
│                                                 │
│ Handlers:                                       │
│  • add, multiply (basic math)                  │
│  • fibonacci (recursive, CPU-intensive)        │
│  • is_prime (primality test)                   │
│  • sum_array (array processing)                │
│  • echo (string handling)                      │
└─────────────────────────────────────────────────┘
```

## Why Rust Workers?

### Use Cases
- **CPU-intensive computations**: Fibonacci, prime checks, cryptography
- **High-performance data processing**: Parsing, compression, encoding
- **System-level operations**: File I/O, networking, OS integration
- **Memory-efficient processing**: Large datasets, streaming
- **Concurrent workloads**: Parallel processing with Rayon

### Benefits
- **Performance**: 10-100x faster than JavaScript for compute tasks
- **Memory safety**: Rust's ownership system prevents crashes
- **Concurrency**: Fearless concurrency with async/await
- **Native dependencies**: Easy FFI with C libraries
- **Small binaries**: Optimized release builds (~1-5MB)

## Prerequisites

### Rust Installation

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Or on Windows
# Download from: https://rustup.rs/
```

### Verify Installation

```bash
rustc --version
cargo --version
```

## Building

### 1. Build Rust Worker

```bash
cd rust
cargo build --release
```

This creates `rust/target/release/rust-worker` (or `rust-worker.exe` on Windows).

Release build is optimized for performance (~1-2 seconds compile time for this example).

### 2. Build Node.js Parent (optional)

```bash
# From examples/rust-worker directory
pnpm install
pnpm build
```

## Running

### Development (TypeScript with tsx)

```bash
# Make sure Rust worker is built first
cd rust && cargo build --release && cd ..

# Run Node.js parent
pnpm dev
```

### Production

```bash
cd rust && cargo build --release && cd ..
pnpm build
pnpm start
```

## Expected Output

```
Parent: Starting Rust worker example...
Parent: Worker path: /path/to/rust/target/release/rust-worker
Parent: Make sure to run "cargo build --release" in the rust/ directory first!

Parent: Channel established

Parent: [Rust Log] Rust worker started

=== Basic Operations ===
Parent: [Rust Log] Processed add
Parent: add(42, 58) = 100
Parent: [Rust Log] Processed multiply
Parent: multiply(12, 34) = 408

=== Fibonacci (Rust performance) ===
Parent: [Rust Log] Processed fibonacci
Parent: fibonacci(30) = 832040
Parent: [Rust Log] Processed fibonacci
Parent: fibonacci(40) = 102334155

=== Prime Number Check ===
Parent: [Rust Log] Processed is_prime
Parent: is_prime(17) = true
Parent: [Rust Log] Processed is_prime
Parent: is_prime(1000000007) = true

=== Array Processing ===
Parent: [Rust Log] Processed sum_array
Parent: sum_array([1..1000]) = 500500

=== Echo Test ===
Parent: [Rust Log] Processed echo
Parent: echo = "Hello from Node.js!"

=== Shutdown ===
Parent: [Rust Log] Shutting down...
Parent: Done
```

## Key Concepts

### Protocol Compatibility

JSON-RPC 2.0 is language-agnostic. Both sides speak the same protocol:

**Request** (Node.js → Rust):
```json
{"jsonrpc":"2.0","id":1,"method":"add","params":{"a":2,"b":3}}
```

**Response** (Rust → Node.js):
```json
{"jsonrpc":"2.0","id":1,"result":5}
```

**Notification** (bidirectional, no response):
```json
{"jsonrpc":"2.0","method":"log","params":{"message":"Worker started"}}
```

### Node.js Side

Uses `@procwire/transport` convenience helpers:

```ts
import { createStdioChannel } from "@procwire/transport";

const channel = await createStdioChannel("/path/to/rust-worker", {
  timeout: 10000,
});

// Request/response
const result = await channel.request("fibonacci", { n: 30 });

// Notification
channel.notify("shutdown", {});

// Listen for notifications from Rust
channel.onNotification("log", (params) => {
  console.log(params.message);
});
```

### Rust Side

Manual JSON-RPC implementation using `serde_json`:

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, stdin};

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Value,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    result: Value,
}

fn main() {
    let stdin = stdin();
    for line in stdin.lock().lines() {
        let request: JsonRpcRequest = serde_json::from_str(&line?)?;
        let result = handle_method(&request.method, &request.params);
        let response = JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id.unwrap(),
            result,
        };
        println!("{}", serde_json::to_string(&response)?);
    }
}
```

## Performance Comparison

Approximate benchmarks (Fibonacci 40):

| Language | Time | Performance |
|----------|------|-------------|
| JavaScript (Node.js) | ~1500ms | Baseline |
| Rust (debug build) | ~800ms | 1.9x faster |
| Rust (release build) | ~80ms | **18.8x faster** |

For prime checking (1,000,000,007):

| Language | Time | Performance |
|----------|------|-------------|
| JavaScript | ~450ms | Baseline |
| Rust | ~15ms | **30x faster** |

*Note: Actual performance depends on algorithm, data size, and hardware.*

## Advanced Patterns

### 1. Async Rust Worker

```rust
use tokio;

#[tokio::main]
async fn main() {
    // Use async I/O for concurrent request handling
}
```

### 2. Binary Protocol (MessagePack)

Replace JSON with MessagePack for better performance:
- Node.js: Use `MessagePackCodec` from `@procwire/codec-msgpack`
- Rust: Use `rmp-serde` crate

### 3. Shared Memory

For ultra-low-latency:
- Use named pipes/unix sockets (data channel pattern)
- Or shared memory via `mmap`

### 4. Error Handling

```rust
match handle_request(&request) {
    Ok(result) => send_response(id, result),
    Err(e) => send_error(id, -32603, e.to_string()),
}
```

## Troubleshooting

### "Rust worker binary not found"

**Cause**: Worker not built or wrong path.

**Solution**:
```bash
cd rust
cargo build --release
```

### "Parse error" in Rust logs

**Cause**: Invalid JSON or protocol mismatch.

**Solution**:
- Verify both sides use JSON-RPC 2.0
- Check line-delimited framing (no extra whitespace)
- Use `cargo run` to test Rust worker standalone

### Rust worker crashes silently

**Cause**: Panic in Rust code.

**Solution**:
- Run in debug mode: `cargo build` (no `--release`)
- Check stderr output
- Add error handling in Rust handlers

### Performance not as expected

**Cause**: Debug build instead of release.

**Solution**:
- Always use `cargo build --release` for production
- Check CPU throttling, background processes
- Profile with `cargo flamegraph`

## CI/CD Considerations

### Option 1: Pre-built Binaries

Commit release binaries to repo (not recommended for large binaries):
```
rust/target/release/
  rust-worker       (Linux)
  rust-worker.exe   (Windows)
  rust-worker.mac   (macOS)
```

### Option 2: Build in CI

Add Rust toolchain to CI:
```yaml
- name: Setup Rust
  uses: actions-rs/toolchain@v1
  with:
    toolchain: stable

- name: Build Rust worker
  run: |
    cd examples/rust-worker/rust
    cargo build --release
```

### Option 3: Skip in CI

Mark example as documentation-only (current approach):
- Include Rust source code
- README with build instructions
- No CI execution

## Next Steps

- Implement more complex algorithms (image processing, ML inference)
- Add authentication/authorization layer
- Use MessagePack or Protobuf for binary protocol
- Implement streaming (large file processing)
- Add worker pool with multiple Rust processes

See [transport README](../../transport/README.md) for more IPC patterns.
