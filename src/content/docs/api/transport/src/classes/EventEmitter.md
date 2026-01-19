---
editUrl: false
next: false
prev: false
title: "EventEmitter"
---

Defined in: [transport/src/utils/events.ts:32](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L32)

Type-safe event emitter with Unsubscribe pattern.
Zero dependencies, designed for transport and channel layers.

## Example

```ts
interface MyEvents extends EventMap {
  'connect': void;
  'data': Buffer;
  'error': Error;
}

const emitter = new EventEmitter<MyEvents>();
const unsub = emitter.on('data', (buf) => console.log(buf));
emitter.emit('data', Buffer.from('hello'));
unsub(); // cleanup
```

## Type Parameters

### TEventMap

`TEventMap` *extends* [`EventMap`](/api/transport/src/interfaces/eventmap/) = [`EventMap`](/api/transport/src/interfaces/eventmap/)

## Constructors

### Constructor

> **new EventEmitter**\<`TEventMap`\>(): `EventEmitter`\<`TEventMap`\>

#### Returns

`EventEmitter`\<`TEventMap`\>

## Methods

### emit()

> **emit**\<`K`\>(`event`, `data`): `void`

Defined in: [transport/src/utils/events.ts:81](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L81)

Emits an event to all registered listeners.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### data

`TEventMap`\[`K`\]

#### Returns

`void`

***

### listenerCount()

> **listenerCount**\<`K`\>(`event`): `number`

Defined in: [transport/src/utils/events.ts:110](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L110)

Returns the number of listeners for a specific event.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

#### Returns

`number`

***

### off()

> **off**\<`K`\>(`event`, `handler`): `void`

Defined in: [transport/src/utils/events.ts:68](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L68)

Removes a specific event listener.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### handler

[`EventHandler`](/api/transport/src/type-aliases/eventhandler/)\<`TEventMap`\[`K`\]\>

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/utils/events.ts:39](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L39)

Subscribes to an event.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### handler

[`EventHandler`](/api/transport/src/type-aliases/eventhandler/)\<`TEventMap`\[`K`\]\>

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function to remove the listener

***

### once()

> **once**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/utils/events.ts:57](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L57)

Subscribes to an event that fires only once.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### handler

[`EventHandler`](/api/transport/src/type-aliases/eventhandler/)\<`TEventMap`\[`K`\]\>

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function (in case you want to cancel before it fires)

***

### removeAllListeners()

> **removeAllListeners**\<`K`\>(`event?`): `void`

Defined in: [transport/src/utils/events.ts:99](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L99)

Removes all listeners for a specific event, or all events if no event specified.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event?

`K`

#### Returns

`void`
