---
editUrl: false
next: false
prev: false
title: "StdioTransport"
---

Defined in: [transport/src/transport/stdio-transport.ts:86](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L86)

Stdio-based transport for parent-child process communication.

Spawns a child process and communicates via stdin/stdout.
Stderr is exposed via separate 'stderr' event.

## Example

```ts
const transport = new StdioTransport({
  executablePath: 'node',
  args: ['worker.js']
});

await transport.connect(); // Spawns process
await transport.write(Buffer.from('hello'));
transport.onData(data => console.log('received:', data));
transport.on('stderr', line => console.error('stderr:', line));
```

## Implements

- [`Transport`](/api/transport/interfaces/transport/)

## Constructors

### Constructor

> **new StdioTransport**(`options`): `StdioTransport`

Defined in: [transport/src/transport/stdio-transport.ts:95](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L95)

#### Parameters

##### options

[`StdioTransportOptions`](/api/transport/interfaces/stdiotransportoptions/)

#### Returns

`StdioTransport`

## Accessors

### state

#### Get Signature

> **get** **state**(): [`TransportState`](/api/transport/type-aliases/transportstate/)

Defined in: [transport/src/transport/stdio-transport.ts:107](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L107)

Current connection state.

##### Returns

[`TransportState`](/api/transport/type-aliases/transportstate/)

Current connection state.

#### Implementation of

[`Transport`](/api/transport/interfaces/transport/).[`state`](/api/transport/interfaces/transport/#state)

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/stdio-transport.ts:111](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L111)

Initiates connection.

#### Returns

`Promise`\<`void`\>

#### Throws

if already connected or invalid state

#### Implementation of

[`Transport`](/api/transport/interfaces/transport/).[`connect`](/api/transport/interfaces/transport/#connect)

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/stdio-transport.ts:180](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L180)

Closes the connection gracefully.

#### Returns

`Promise`\<`void`\>

#### Throws

if not connected

#### Implementation of

[`Transport`](/api/transport/interfaces/transport/).[`disconnect`](/api/transport/interfaces/transport/#disconnect)

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/stdio-transport.ts:256](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L256)

Subscribes to transport events.

#### Type Parameters

##### K

`K` *extends* keyof [`StdioTransportEvents`](/api/transport/interfaces/stdiotransportevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function

#### Implementation of

[`Transport`](/api/transport/interfaces/transport/).[`on`](/api/transport/interfaces/transport/#on)

***

### onData()

> **onData**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/stdio-transport.ts:252](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L252)

Subscribes to data events.

#### Parameters

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function

#### Implementation of

[`Transport`](/api/transport/interfaces/transport/).[`onData`](/api/transport/interfaces/transport/#ondata)

***

### write()

> **write**(`data`): `Promise`\<`void`\>

Defined in: [transport/src/transport/stdio-transport.ts:220](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L220)

Writes data to the transport.

#### Parameters

##### data

`Buffer`

#### Returns

`Promise`\<`void`\>

#### Throws

if not connected or write fails

#### Implementation of

[`Transport`](/api/transport/interfaces/transport/).[`write`](/api/transport/interfaces/transport/#write)
