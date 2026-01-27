# @procwire/integration-tests

End-to-end integration tests for the `@procwire/*` packages. This package tests the complete communication flow between `@procwire/sdk` workers and `@procwire/transport` process managers.

## Test Categories

| Category        | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `lifecycle`     | Worker spawn, shutdown, crash recovery, signal handling              |
| `communication` | Request/response, notifications, concurrent requests, large payloads |
| `codecs`        | JSON, MessagePack, Protocol Buffers serialization                    |
| `stress`        | High throughput, many workers, long-running, memory stability        |
| `edge-cases`    | Rapid restart, orphan cleanup, race conditions                       |

## Running Tests

```bash
# All tests
pnpm test

# Specific category
pnpm test:lifecycle
pnpm test:communication
pnpm test:codecs
pnpm test:stress
pnpm test:edge-cases

# Watch mode
pnpm test:watch

# Verbose output
pnpm test:all
```

## Workers

Test workers are located in `workers/` directory:

- `echo-worker.ts` - Simple echo worker for basic tests
- `compute-worker.ts` - CPU-intensive tasks for stress testing
- `slow-worker.ts` - Configurable delay for timeout tests
- `crash-worker.ts` - Intentional crashes for recovery tests
- `error-worker.ts` - Error handling scenarios

## Architecture

```
@procwire/transport (ProcessManager)
         ↓
    JSON-RPC over stdio
         ↓
@procwire/sdk (createWorker)
```

The tests verify the complete round-trip communication, including:

- Handshake protocol
- Request/response correlation
- Error propagation
- Graceful shutdown
- Codec serialization/deserialization
