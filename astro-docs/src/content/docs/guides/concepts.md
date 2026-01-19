---
title: Core Concepts
description: Understand the architecture and design principles of Procwire Transport
---

## Architecture Overview

Procwire Transport uses a **layered architecture** where each layer is independent and replaceable. This modular design allows you to mix and match components based on your needs.

```
Application Layer (ProcessManager, ChannelPair)
         ↓
Channel Layer (RequestChannel, StreamChannel)
         ↓
Protocol Layer (JSON-RPC 2.0, custom protocols)
         ↓
Serialization Layer (JSON, MessagePack, Protobuf, Arrow)
         ↓
Framing Layer (line-delimited, length-prefixed)
         ↓
Transport Layer (stdio, named pipes, unix sockets)
         ↓
OS Layer (child_process, net.Server/Socket)
```

## Core Layers

### Transport Layer

The **Transport** layer handles raw byte transfer between endpoints. It provides a unified interface for different communication mechanisms:

- **Stdio Transport**: Communication with child processes via stdin/stdout
- **Socket Transport**: Unix Domain Sockets (Linux/macOS) or Named Pipes (Windows)
- **Custom Transports**: Implement the [Transport](/api/transport/src/interfaces/transport/) interface

**Key Types:**
- [Transport](/api/transport/src/interfaces/transport/) - Base transport interface
- [StdioTransport](/api/transport/src/classes/stdiotransport/) - Child process communication
- [SocketTransport](/api/transport/src/classes/sockettransport/) - Socket/pipe client
- [SocketServer](/api/transport/src/classes/socketserver/) - Socket/pipe server

### Framing Layer

The **Framing** layer determines how to detect message boundaries in a byte stream:

- **Line-Delimited**: Messages separated by newlines (`\n`)
- **Length-Prefixed**: 4-byte length header followed by message data
- **Custom Framing**: Implement the [FramingCodec](/api/transport/src/interfaces/framingcodec/) interface

**Why Framing Matters:**
Raw byte streams don't have built-in message boundaries. The framing layer ensures that `"hello"` and `"world"` sent separately arrive as two distinct messages, not as `"helloworld"`.

**Key Types:**
- [FramingCodec](/api/transport/src/interfaces/framingcodec/) - Framing interface
- [LineDelimitedFraming](/api/transport/src/classes/linedelimitedframing/) - Newline-delimited messages
- [LengthPrefixedFraming](/api/transport/src/classes/lengthprefixedframing/) - Binary length prefix

### Serialization Layer

The **Serialization** layer converts between JavaScript objects and binary representations:

- **JSON** (built-in): Human-readable, widely compatible
- **MessagePack** (`@procwire/codec-msgpack`): Compact binary format, faster than JSON
- **Protocol Buffers** (`@procwire/codec-protobuf`): Schema-based, type-safe
- **Apache Arrow** (`@procwire/codec-arrow`): Columnar format for data analytics
- **Custom Codecs**: Implement the [SerializationCodec](/api/transport/src/interfaces/serializationcodec/) interface

**Key Types:**
- [SerializationCodec](/api/transport/src/interfaces/serializationcodec/) - Serialization interface
- [JsonCodec](/api/transport/src/classes/jsoncodec/) - JSON serialization
- [RawCodec](/api/transport/src/classes/rawcodec/) - No-op codec (pass-through)

### Protocol Layer

The **Protocol** layer defines the application-level message format and semantics:

- **JSON-RPC 2.0**: Standard request/response protocol with error handling
- **Simple Protocol**: Lightweight custom protocol
- **Custom Protocols**: Implement the [Protocol](/api/transport/src/interfaces/protocol/) interface

**Key Concepts:**
- **Requests**: Method calls with parameters that expect responses
- **Responses**: Results or errors returned for requests
- **Notifications**: One-way messages (no response expected)

**Key Types:**
- [Protocol](/api/transport/src/interfaces/protocol/) - Protocol interface
- [JsonRpcProtocol](/api/transport/src/classes/jsonrpcprotocol/) - JSON-RPC 2.0 implementation
- [SimpleProtocol](/api/transport/src/classes/simpleprotocol/) - Lightweight protocol

### Channel Layer

The **Channel** layer combines all lower layers into a high-level communication API:

- [RequestChannel](/api/transport/src/classes/requestchannel/) - Request/response communication
- [ChannelBuilder](/api/transport/src/classes/channelbuilder/) - Fluent API for channel configuration
- Quickstart helpers: `createStdioChannel()`, `createPipeChannel()`

**Key Features:**
- Type-safe request/response handling
- Automatic timeout management
- Middleware support
- Event-based notifications

### Process Management Layer

The **Process Management** layer provides high-level abstractions for managing worker processes:

- [ProcessManager](/api/transport/src/classes/processmanager/) - Manages worker lifecycle
- [ProcessHandle](/api/transport/src/classes/processhandle/) - Represents a managed worker
- Automatic restart policies
- Health monitoring

## Design Principles

### Zero Dependencies

The core `@procwire/transport` package has **zero runtime dependencies**. This ensures:
- Minimal bundle size
- No dependency conflicts
- Fast installation
- Security through simplicity

Optional codec packages have their own peer dependencies (e.g., `@msgpack/msgpack`, `protobufjs`).

### Modular Design

Each layer is independent and replaceable:

```javascript
// Mix and match any combination
const channel = new ChannelBuilder()
  .withTransport(anyTransport)      // stdio, socket, custom
  .withFraming(anyFraming)          // line-delimited, length-prefixed, custom
  .withSerialization(anyCodec)      // JSON, MessagePack, Protobuf, custom
  .withProtocol(anyProtocol)        // JSON-RPC, Simple, custom
  .build();
```

### Type Safety

Full TypeScript support with generics throughout:

```typescript
interface MyRequest {
  method: 'add' | 'subtract';
  params: { a: number; b: number };
}

interface MyResponse {
  result: number;
}

const channel: Channel<MyRequest, MyResponse> = ...;
const response = await channel.request('add', { a: 1, b: 2 });
// response.result is typed as number
```

### Cross-Platform

Automatic platform detection and optimal implementation selection:

- **Windows**: Uses Named Pipes (`\\\\.\\pipe\\...`)
- **Linux/macOS**: Uses Unix Domain Sockets (`/tmp/...`)

The [TransportFactory](/api/transport/src/classes/transportfactory/) handles platform differences automatically.

## Monorepo Structure

The project is organized as a pnpm workspace:

```
ipc-bridge-core/
├── transport/              # Core package (@procwire/transport)
│   └── src/
│       ├── transport/      # Transport implementations
│       ├── framing/        # Framing codecs
│       ├── serialization/  # Built-in codecs (JSON, Raw)
│       ├── protocol/       # Protocol implementations
│       ├── channel/        # Channel abstractions
│       ├── process/        # Process management
│       └── utils/          # Internal utilities
├── codec-msgpack/          # MessagePack codec
├── codec-protobuf/         # Protocol Buffers codec
├── codec-arrow/            # Apache Arrow codec
└── examples/               # Usage examples
```

## Common Patterns

### Request/Response

The most common pattern: send a request, wait for a response.

```javascript
const result = await channel.request('method', { params });
```

### Notifications

One-way messages (fire and forget):

```javascript
// Sender
await channel.notify('event', { data: 'value' });

// Receiver
channel.onNotification((method, params) => {
  console.log(`Received ${method}:`, params);
});
```

### Bidirectional Communication

Both sides can send requests to each other:

```javascript
// Client can handle requests from server
channel.onRequest(async (method, params) => {
  if (method === 'ping') {
    return 'pong';
  }
});

// Server can handle requests from client
channel.onRequest(async (method, params) => {
  // Handle client requests
});
```

## Next Steps

- See [Getting Started](/guides/getting-started/) for practical examples
- Explore the [API Reference](/api/) for detailed documentation
- Check out real-world [examples](https://github.com/procwire/ipc-bridge-core/tree/main/examples)
