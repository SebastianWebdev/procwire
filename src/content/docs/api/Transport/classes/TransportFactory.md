---
editUrl: false
next: false
prev: false
title: "TransportFactory"
---

Defined in: [transport/src/transport/factory.ts:32](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/factory.ts#L32)

Factory for creating transport instances.

Provides convenient methods for creating different types of transports
with platform-specific optimizations.

## Example

```ts
// Create stdio transport for child process
const transport = TransportFactory.createStdio({
  executablePath: 'node',
  args: ['worker.js']
});

// Create pipe/socket client
const client = TransportFactory.createPipeClient({
  path: '/tmp/my-socket.sock'
});

// Create pipe/socket server
const server = TransportFactory.createPipeServer();
await server.listen('/tmp/my-socket.sock');
```

## Constructors

### Constructor

> **new TransportFactory**(): `TransportFactory`

#### Returns

`TransportFactory`

## Methods

### createOptimal()

> `static` **createOptimal**(`options`): [`Transport`](/api/transport/interfaces/transport/)

Defined in: [transport/src/transport/factory.ts:128](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/factory.ts#L128)

Creates an optimal transport based on options and platform.

Automatically selects:
- Stdio transport if executablePath is provided
- Pipe/socket transport if path is provided

#### Parameters

##### options

[`StdioTransportOptions`](/api/transport/interfaces/stdiotransportoptions/) \| [`SocketTransportOptions`](/api/transport/interfaces/sockettransportoptions/) & `object`

Mixed transport options

#### Returns

[`Transport`](/api/transport/interfaces/transport/)

Transport instance

#### Throws

if options are invalid or ambiguous

#### Example

```ts
// Stdio transport
const stdio = TransportFactory.createOptimal({
  executablePath: 'node',
  args: ['worker.js']
});

// Pipe transport
const pipe = TransportFactory.createOptimal({
  path: '/tmp/my-socket.sock'
});
```

***

### createPipeClient()

> `static` **createPipeClient**(`options`): [`Transport`](/api/transport/interfaces/transport/)

Defined in: [transport/src/transport/factory.ts:72](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/factory.ts#L72)

Creates a pipe/socket client transport.

Automatically uses the appropriate implementation for the current platform:
- Windows: Named Pipes
- Unix: Unix Domain Sockets

#### Parameters

##### options

[`SocketTransportOptions`](/api/transport/interfaces/sockettransportoptions/)

Socket transport options

#### Returns

[`Transport`](/api/transport/interfaces/transport/)

SocketTransport instance

#### Example

```ts
const transport = TransportFactory.createPipeClient({
  path: isWindows() ? '\\\\.\\pipe\\my-pipe' : '/tmp/my-socket.sock',
  connectionTimeout: 5000
});
await transport.connect();
```

***

### createPipeServer()

> `static` **createPipeServer**(`options?`): [`TransportServer`](/api/transport/interfaces/transportserver/)

Defined in: [transport/src/transport/factory.ts:99](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/factory.ts#L99)

Creates a pipe/socket server.

Automatically uses the appropriate implementation for the current platform:
- Windows: Named Pipe Server
- Unix: Unix Domain Socket Server

#### Parameters

##### options?

[`SocketServerOptions`](/api/transport/interfaces/socketserveroptions/)

Socket server options

#### Returns

[`TransportServer`](/api/transport/interfaces/transportserver/)

SocketServer instance

#### Example

```ts
const server = TransportFactory.createPipeServer();
await server.listen('/tmp/my-socket.sock');

server.onConnection(transport => {
  console.log('Client connected');
  transport.onData(data => {
    transport.write(data); // Echo back
  });
});
```

***

### createStdio()

> `static` **createStdio**(`options`): [`StdioTransport`](/api/transport/classes/stdiotransport/)

Defined in: [transport/src/transport/factory.ts:49](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/factory.ts#L49)

Creates a stdio transport for child process communication.

#### Parameters

##### options

[`StdioTransportOptions`](/api/transport/interfaces/stdiotransportoptions/)

Stdio transport options

#### Returns

[`StdioTransport`](/api/transport/classes/stdiotransport/)

StdioTransport instance

#### Example

```ts
const transport = TransportFactory.createStdio({
  executablePath: 'node',
  args: ['worker.js'],
  cwd: '/path/to/project'
});
await transport.connect();
```

***

### isValidPath()

> `static` **isValidPath**(`path`): `boolean`

Defined in: [transport/src/transport/factory.ts:166](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/factory.ts#L166)

Validates if a path is valid for the current platform.

#### Parameters

##### path

`string`

Path to validate

#### Returns

`boolean`

true if path is valid for current platform

#### Example

```ts
// Windows
TransportFactory.isValidPath('\\\\.\\pipe\\my-pipe'); // true
TransportFactory.isValidPath('/tmp/socket.sock'); // false (Unix path on Windows)

// Unix
TransportFactory.isValidPath('/tmp/socket.sock'); // true
TransportFactory.isValidPath('\\\\.\\pipe\\my-pipe'); // false (Windows path on Unix)
```
