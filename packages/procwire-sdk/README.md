# @procwire/procwire-sdk

Procwire SDK for Node.js - build IPC workers with ease.

## Installation

```bash
npm install @procwire/procwire-sdk
# or
pnpm add @procwire/procwire-sdk
```

## Quick Start

```typescript
import { createWorker } from "@procwire/procwire-sdk";

const worker = createWorker({ name: "my-worker" });

// Register request handlers
worker.handle("echo", (params) => {
  return params; // Echo back the params
});

worker.handle("add", ({ a, b }: { a: number; b: number }) => {
  return { sum: a + b };
});

// Lifecycle hooks
worker.hooks({
  onReady: () => console.log("Worker ready!"),
  onShutdown: (reason) => console.log(`Shutting down: ${reason}`),
});

// Start processing requests
worker.start();
```

## Type-Safe Workers

For full type inference, use `createTypedWorker`:

```typescript
import { createTypedWorker } from "@procwire/procwire-sdk";

// Define your API contract
interface MyMethods {
  greet: {
    params: { name: string };
    result: { message: string };
  };
  calculate: {
    params: { expression: string };
    result: { value: number };
  };
}

const worker = createTypedWorker<MyMethods>();

// Full autocomplete and type checking!
worker.handle("greet", (params) => ({
  message: `Hello, ${params.name}!`,
}));

worker.start();
```

## Data Channel with Custom Codec

```typescript
import { createWorker } from "@procwire/procwire-sdk";
import { MessagePackCodec } from "@procwire/codec-msgpack";

const worker = createWorker({
  name: "high-throughput-worker",
  dataChannel: {
    serialization: new MessagePackCodec(),
  },
});
```

## API Reference

See the [full documentation](https://procwire.dev/api/procwire-sdk).

## License

MIT
