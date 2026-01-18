---
editUrl: false
next: false
prev: false
title: "SocketServer"
---

Defined in: [transport/src/transport/socket-server.ts:39](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L39)

Socket server implementation for Named Pipes (Windows) and Unix Domain Sockets.

Accepts client connections and creates Transport instances for each connection.

## Example

```ts
const server = new SocketServer();
const address = await server.listen('/tmp/my-server.sock');

server.onConnection(transport => {
  console.log('Client connected');
  transport.onData(data => {
    console.log('received:', data);
    transport.write(data); // Echo back
  });
});
```

## Implements

- [`TransportServer`](/api/transport/src/interfaces/transportserver/)

## Constructors

### Constructor

> **new SocketServer**(`options`): `SocketServer`

Defined in: [transport/src/transport/socket-server.ts:46](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L46)

#### Parameters

##### options

[`SocketServerOptions`](/api/transport/src/interfaces/socketserveroptions/) = `{}`

#### Returns

`SocketServer`

## Accessors

### address

#### Get Signature

> **get** **address**(): [`ServerAddress`](/api/transport/src/interfaces/serveraddress/) \| `null`

Defined in: [transport/src/transport/socket-server.ts:56](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L56)

Server address (only available when listening).

##### Returns

[`ServerAddress`](/api/transport/src/interfaces/serveraddress/) \| `null`

Server address (only available when listening).

#### Implementation of

[`TransportServer`](/api/transport/src/interfaces/transportserver/).[`address`](/api/transport/src/interfaces/transportserver/#address)

***

### isListening

#### Get Signature

> **get** **isListening**(): `boolean`

Defined in: [transport/src/transport/socket-server.ts:52](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L52)

Returns true if server is currently listening.

##### Returns

`boolean`

Returns true if server is currently listening.

#### Implementation of

[`TransportServer`](/api/transport/src/interfaces/transportserver/).[`isListening`](/api/transport/src/interfaces/transportserver/#islistening)

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/socket-server.ts:106](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L106)

Stops the server and closes all active connections.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`TransportServer`](/api/transport/src/interfaces/transportserver/).[`close`](/api/transport/src/interfaces/transportserver/#close)

***

### listen()

> **listen**(`address`): `Promise`\<[`ServerAddress`](/api/transport/src/interfaces/serveraddress/)\>

Defined in: [transport/src/transport/socket-server.ts:60](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L60)

Starts listening for connections.

#### Parameters

##### address

Platform-specific address (pipe name, socket path, port)

`string` | `number`

#### Returns

`Promise`\<[`ServerAddress`](/api/transport/src/interfaces/serveraddress/)\>

#### Throws

if already listening

#### Implementation of

[`TransportServer`](/api/transport/src/interfaces/transportserver/).[`listen`](/api/transport/src/interfaces/transportserver/#listen)

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/socket-server.ts:140](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L140)

Subscribes to server events.

#### Type Parameters

##### K

`K` *extends* keyof [`TransportServerEvents`](/api/transport/src/interfaces/transportserverevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

#### Implementation of

[`TransportServer`](/api/transport/src/interfaces/transportserver/).[`on`](/api/transport/src/interfaces/transportserver/#on)

***

### onConnection()

> **onConnection**(`handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/socket-server.ts:136](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/socket-server.ts#L136)

Subscribes to new connection events.

#### Parameters

##### handler

(`transport`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

#### Implementation of

[`TransportServer`](/api/transport/src/interfaces/transportserver/).[`onConnection`](/api/transport/src/interfaces/transportserver/#onconnection)
