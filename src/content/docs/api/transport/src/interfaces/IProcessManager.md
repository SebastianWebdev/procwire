---
editUrl: false
next: false
prev: false
title: "IProcessManager"
---

Defined in: [transport/src/process/types.ts:315](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L315)

Process manager interface.
Manages the lifecycle of multiple child processes.

## Methods

### getHandle()

> **getHandle**(`id`): [`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/) \| `null`

Defined in: [transport/src/process/types.ts:342](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L342)

Gets a process handle by ID.

#### Parameters

##### id

`string`

Process identifier

#### Returns

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/) \| `null`

Process handle or null if not found

***

### isRunning()

> **isRunning**(`id`): `boolean`

Defined in: [transport/src/process/types.ts:349](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L349)

Checks if a process is running.

#### Parameters

##### id

`string`

Process identifier

#### Returns

`boolean`

true if process exists and is in 'running' state

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/process/types.ts:355](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L355)

Subscribes to manager events.

#### Type Parameters

##### K

`K` *extends* keyof [`ProcessManagerEvents`](/api/transport/src/interfaces/processmanagerevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

***

### spawn()

> **spawn**(`id`, `options`): `Promise`\<[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/)\>

Defined in: [transport/src/process/types.ts:323](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L323)

Spawns a new managed process.

#### Parameters

##### id

`string`

Unique process identifier

##### options

[`SpawnOptions`](/api/transport/src/interfaces/spawnoptions/)

Spawn options

#### Returns

`Promise`\<[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/)\>

Promise resolving to process handle

#### Throws

if process with this ID already exists

***

### terminate()

> **terminate**(`id`): `Promise`\<`void`\>

Defined in: [transport/src/process/types.ts:330](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L330)

Terminates a managed process.

#### Parameters

##### id

`string`

Process identifier

#### Returns

`Promise`\<`void`\>

#### Throws

if process doesn't exist

***

### terminateAll()

> **terminateAll**(): `Promise`\<`void`\>

Defined in: [transport/src/process/types.ts:335](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L335)

Terminates all managed processes.

#### Returns

`Promise`\<`void`\>
