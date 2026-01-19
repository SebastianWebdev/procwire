---
editUrl: false
next: false
prev: false
title: "SocketTransportOptions"
---

Defined in: [transport/src/transport/socket-transport.ts:10](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L10)

Socket transport options (Named Pipes on Windows, Unix Domain Sockets on Unix).

## Properties

### autoReconnect?

> `optional` **autoReconnect**: `boolean`

Defined in: [transport/src/transport/socket-transport.ts:28](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L28)

Enable automatic reconnection on disconnect.

#### Default

```ts
false
```

***

### connectionTimeout?

> `optional` **connectionTimeout**: `number`

Defined in: [transport/src/transport/socket-transport.ts:22](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L22)

Connection timeout in milliseconds.

#### Default

```ts
5000
```

***

### maxReconnectDelay?

> `optional` **maxReconnectDelay**: `number`

Defined in: [transport/src/transport/socket-transport.ts:40](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L40)

Maximum reconnect delay in milliseconds (for exponential backoff).

#### Default

```ts
30000
```

***

### path

> **path**: `string`

Defined in: [transport/src/transport/socket-transport.ts:16](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L16)

Pipe/socket path to connect to.
Windows: `\\.\pipe\<name>`
Unix: `/tmp/<name>.sock`

***

### reconnectDelay?

> `optional` **reconnectDelay**: `number`

Defined in: [transport/src/transport/socket-transport.ts:34](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L34)

Initial reconnect delay in milliseconds.

#### Default

```ts
1000
```
