---
editUrl: false
next: false
prev: false
title: "PipeChannelOptions"
---

Defined in: [transport/src/channel/quickstart.ts:26](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L26)

Options for pipe channel creation.

## Extends

- `Omit`\<[`SocketTransportOptions`](/api/transport/src/interfaces/sockettransportoptions/), `"path"`\>

## Properties

### autoReconnect?

> `optional` **autoReconnect**: `boolean`

Defined in: [transport/src/transport/socket-transport.ts:28](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L28)

Enable automatic reconnection on disconnect.

#### Default

```ts
false
```

#### Inherited from

[`SocketTransportOptions`](/api/transport/src/interfaces/sockettransportoptions/).[`autoReconnect`](/api/transport/src/interfaces/sockettransportoptions/#autoreconnect)

***

### connectionTimeout?

> `optional` **connectionTimeout**: `number`

Defined in: [transport/src/transport/socket-transport.ts:22](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L22)

Connection timeout in milliseconds.

#### Default

```ts
5000
```

#### Inherited from

[`SocketTransportOptions`](/api/transport/src/interfaces/sockettransportoptions/).[`connectionTimeout`](/api/transport/src/interfaces/sockettransportoptions/#connectiontimeout)

***

### maxReconnectDelay?

> `optional` **maxReconnectDelay**: `number`

Defined in: [transport/src/transport/socket-transport.ts:40](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L40)

Maximum reconnect delay in milliseconds (for exponential backoff).

#### Default

```ts
30000
```

#### Inherited from

[`SocketTransportOptions`](/api/transport/src/interfaces/sockettransportoptions/).[`maxReconnectDelay`](/api/transport/src/interfaces/sockettransportoptions/#maxreconnectdelay)

***

### reconnectDelay?

> `optional` **reconnectDelay**: `number`

Defined in: [transport/src/transport/socket-transport.ts:34](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L34)

Initial reconnect delay in milliseconds.

#### Default

```ts
1000
```

#### Inherited from

[`SocketTransportOptions`](/api/transport/src/interfaces/sockettransportoptions/).[`reconnectDelay`](/api/transport/src/interfaces/sockettransportoptions/#reconnectdelay)

***

### timeout?

> `optional` **timeout**: `number`

Defined in: [transport/src/channel/quickstart.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L31)

Request timeout in milliseconds.

#### Default

```ts
30000
```

***

### useLineDelimited?

> `optional` **useLineDelimited**: `boolean`

Defined in: [transport/src/channel/quickstart.ts:37](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L37)

Use line-delimited framing instead of length-prefixed.

#### Default

```ts
false (uses length-prefixed)
```
