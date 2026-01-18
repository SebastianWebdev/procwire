---
editUrl: false
next: false
prev: false
title: "ProcessHandle"
---

Defined in: [transport/src/process/handle.ts:14](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L14)

Process handle implementation.
Encapsulates a managed process and its communication channels.

## Implements

- [`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/)

## Constructors

### Constructor

> **new ProcessHandle**(`id`, `pid`, `controlChannel`, `dataChannel`): `ProcessHandle`

Defined in: [transport/src/process/handle.ts:22](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L22)

#### Parameters

##### id

`string`

##### pid

`number` | `null`

##### controlChannel

[`Channel`](/api/transport/src/interfaces/channel/)

##### dataChannel

[`Channel`](/api/transport/src/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\> | `null`

#### Returns

`ProcessHandle`

## Accessors

### controlChannel

#### Get Signature

> **get** **controlChannel**(): [`Channel`](/api/transport/src/interfaces/channel/)

Defined in: [transport/src/process/handle.ts:47](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L47)

Control channel (stdio-based, always available).

##### Returns

[`Channel`](/api/transport/src/interfaces/channel/)

Control channel (stdio-based, always available).

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`controlChannel`](/api/transport/src/interfaces/iprocesshandle/#controlchannel)

***

### dataChannel

#### Get Signature

> **get** **dataChannel**(): [`Channel`](/api/transport/src/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\> \| `null`

Defined in: [transport/src/process/handle.ts:51](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L51)

Data channel (pipe-based, optional).

##### Returns

[`Channel`](/api/transport/src/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\> \| `null`

Data channel (pipe-based, optional).

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`dataChannel`](/api/transport/src/interfaces/iprocesshandle/#datachannel)

***

### id

#### Get Signature

> **get** **id**(): `string`

Defined in: [transport/src/process/handle.ts:35](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L35)

Unique process identifier.

##### Returns

`string`

Unique process identifier.

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`id`](/api/transport/src/interfaces/iprocesshandle/#id)

***

### pid

#### Get Signature

> **get** **pid**(): `number` \| `null`

Defined in: [transport/src/process/handle.ts:39](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L39)

Process ID (OS-level).

##### Returns

`number` \| `null`

Process ID (OS-level).

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`pid`](/api/transport/src/interfaces/iprocesshandle/#pid)

***

### state

#### Get Signature

> **get** **state**(): [`ProcessState`](/api/transport/src/type-aliases/processstate/)

Defined in: [transport/src/process/handle.ts:43](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L43)

Current process state.

##### Returns

[`ProcessState`](/api/transport/src/type-aliases/processstate/)

Current process state.

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`state`](/api/transport/src/interfaces/iprocesshandle/#state)

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/process/handle.ts:110](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L110)

Closes the handle and its channels.
Does not terminate the process.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`close`](/api/transport/src/interfaces/iprocesshandle/#close)

***

### notify()

> **notify**(`method`, `params?`): `Promise`\<`void`\>

Defined in: [transport/src/process/handle.ts:87](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L87)

Sends a notification via control channel.

#### Parameters

##### method

`string`

##### params?

`unknown`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`notify`](/api/transport/src/interfaces/iprocesshandle/#notify)

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/process/handle.ts:120](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L120)

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

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`on`](/api/transport/src/interfaces/iprocesshandle/#on)

***

### request()

> **request**(`method`, `params?`, `timeout?`): `Promise`\<`unknown`\>

Defined in: [transport/src/process/handle.ts:80](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L80)

Sends a request via control channel.

#### Parameters

##### method

`string`

##### params?

`unknown`

##### timeout?

`number`

#### Returns

`Promise`\<`unknown`\>

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`request`](/api/transport/src/interfaces/iprocesshandle/#request)

***

### requestViaData()

> **requestViaData**(`method`, `params?`, `timeout?`): `Promise`\<`unknown`\>

Defined in: [transport/src/process/handle.ts:95](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/handle.ts#L95)

Sends a request via data channel.

#### Parameters

##### method

`string`

##### params?

`unknown`

##### timeout?

`number`

#### Returns

`Promise`\<`unknown`\>

#### Throws

if data channel is not available

#### Implementation of

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/).[`requestViaData`](/api/transport/src/interfaces/iprocesshandle/#requestviadata)
