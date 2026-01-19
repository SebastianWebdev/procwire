---
editUrl: false
next: false
prev: false
title: "IProcessHandle"
---

Defined in: [transport/src/process/types.ts:243](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L243)

Process handle interface.
Provides access to a managed process and its channels.

## Properties

### controlChannel

> `readonly` **controlChannel**: [`Channel`](/api/transport/src/interfaces/channel/)

Defined in: [transport/src/process/types.ts:262](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L262)

Control channel (stdio-based, always available).

***

### dataChannel

> `readonly` **dataChannel**: [`Channel`](/api/transport/src/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\> \| `null`

Defined in: [transport/src/process/types.ts:267](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L267)

Data channel (pipe-based, optional).

***

### id

> `readonly` **id**: `string`

Defined in: [transport/src/process/types.ts:247](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L247)

Unique process identifier.

***

### pid

> `readonly` **pid**: `number` \| `null`

Defined in: [transport/src/process/types.ts:252](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L252)

Process ID (OS-level).

***

### state

> `readonly` **state**: [`ProcessState`](/api/transport/src/type-aliases/processstate/)

Defined in: [transport/src/process/types.ts:257](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L257)

Current process state.

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/process/types.ts:299](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L299)

Closes the handle and its channels.
Does not terminate the process - use ProcessManager.terminate() for that.

#### Returns

`Promise`\<`void`\>

***

### notify()

> **notify**(`method`, `params?`): `Promise`\<`void`\>

Defined in: [transport/src/process/types.ts:283](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L283)

Sends a notification via control channel.

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

#### Returns

`Promise`\<`void`\>

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/process/types.ts:305](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L305)

Subscribes to handle events.

#### Type Parameters

##### K

`K` *extends* keyof [`ProcessHandleEvents`](/api/transport/src/interfaces/processhandleevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

***

### request()

> **request**(`method`, `params?`, `timeout?`): `Promise`\<`unknown`\>

Defined in: [transport/src/process/types.ts:276](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L276)

Sends a request via control channel.

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

##### timeout?

`number`

Optional timeout override

#### Returns

`Promise`\<`unknown`\>

Promise resolving to response result

***

### requestViaData()

> **requestViaData**(`method`, `params?`, `timeout?`): `Promise`\<`unknown`\>

Defined in: [transport/src/process/types.ts:293](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L293)

Sends a request via data channel.

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

##### timeout?

`number`

Optional timeout override

#### Returns

`Promise`\<`unknown`\>

Promise resolving to response result

#### Throws

if data channel is not enabled
