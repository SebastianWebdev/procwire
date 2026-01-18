---
editUrl: false
next: false
prev: false
title: "SocketTransport"
---

Defined in: [transport/src/transport/socket-transport.ts:56](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L56)

Socket-based transport implementation for Named Pipes (Windows) and Unix Domain Sockets.

Provides bidirectional byte stream communication over local sockets.

## Example

```ts
const transport = new SocketTransport({ path: '/tmp/my-socket.sock' });
await transport.connect();
await transport.write(Buffer.from('hello'));
transport.onData(data => console.log('received:', data));
```

## Implements

- [`Transport`](/api/transport/src/interfaces/transport/)

## Constructors

### Constructor

> **new SocketTransport**(`options`): `SocketTransport`

Defined in: [transport/src/transport/socket-transport.ts:66](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L66)

#### Parameters

##### options

[`SocketTransportOptions`](/api/transport/src/interfaces/sockettransportoptions/)

#### Returns

`SocketTransport`

## Accessors

### state

#### Get Signature

> **get** **state**(): [`TransportState`](/api/transport/src/type-aliases/transportstate/)

Defined in: [transport/src/transport/socket-transport.ts:76](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L76)

Current connection state.

##### Returns

[`TransportState`](/api/transport/src/type-aliases/transportstate/)

Current connection state.

#### Implementation of

[`Transport`](/api/transport/src/interfaces/transport/).[`state`](/api/transport/src/interfaces/transport/#state)

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/socket-transport.ts:80](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L80)

Initiates connection.

#### Returns

`Promise`\<`void`\>

#### Throws

if already connected or invalid state

#### Implementation of

[`Transport`](/api/transport/src/interfaces/transport/).[`connect`](/api/transport/src/interfaces/transport/#connect)

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/socket-transport.ts:139](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L139)

Closes the connection gracefully.

#### Returns

`Promise`\<`void`\>

#### Throws

if not connected

#### Implementation of

[`Transport`](/api/transport/src/interfaces/transport/).[`disconnect`](/api/transport/src/interfaces/transport/#disconnect)

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/socket-transport.ts:210](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L210)

Subscribes to transport events.

#### Type Parameters

##### K

`K` *extends* keyof [`TransportEvents`](/api/transport/src/interfaces/transportevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

#### Implementation of

[`Transport`](/api/transport/src/interfaces/transport/).[`on`](/api/transport/src/interfaces/transport/#on)

***

### onData()

> **onData**(`handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/socket-transport.ts:206](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L206)

Subscribes to data events.

#### Parameters

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

#### Implementation of

[`Transport`](/api/transport/src/interfaces/transport/).[`onData`](/api/transport/src/interfaces/transport/#ondata)

***

### write()

> **write**(`data`): `Promise`\<`void`\>

Defined in: [transport/src/transport/socket-transport.ts:179](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-transport.ts#L179)

Writes data to the transport.

#### Parameters

##### data

`Buffer`

#### Returns

`Promise`\<`void`\>

#### Throws

if not connected or write fails

#### Implementation of

[`Transport`](/api/transport/src/interfaces/transport/).[`write`](/api/transport/src/interfaces/transport/#write)
