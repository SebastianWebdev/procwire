---
editUrl: false
next: false
prev: false
title: "ProcessManager"
---

Defined in: [transport/src/process/manager.ts:44](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L44)

Process manager implementation.
Manages the lifecycle of multiple child processes with restart capability.

## Implements

- [`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/)

## Constructors

### Constructor

> **new ProcessManager**(`config`): `ProcessManager`

Defined in: [transport/src/process/manager.ts:49](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L49)

#### Parameters

##### config

[`ProcessManagerConfig`](/api/transport/src/interfaces/processmanagerconfig/) = `{}`

#### Returns

`ProcessManager`

## Methods

### getHandle()

> **getHandle**(`id`): [`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/) \| `null`

Defined in: [transport/src/process/manager.ts:184](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L184)

Gets a process handle by ID.

#### Parameters

##### id

`string`

#### Returns

[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/) \| `null`

#### Implementation of

[`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/).[`getHandle`](/api/transport/src/interfaces/iprocessmanager/#gethandle)

***

### isRunning()

> **isRunning**(`id`): `boolean`

Defined in: [transport/src/process/manager.ts:191](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L191)

Checks if a process is running.

#### Parameters

##### id

`string`

#### Returns

`boolean`

#### Implementation of

[`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/).[`isRunning`](/api/transport/src/interfaces/iprocessmanager/#isrunning)

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/process/manager.ts:199](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L199)

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

#### Implementation of

[`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/).[`on`](/api/transport/src/interfaces/iprocessmanager/#on)

***

### spawn()

> **spawn**(`id`, `options`): `Promise`\<[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/)\>

Defined in: [transport/src/process/manager.ts:66](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L66)

Spawns a new managed process.

#### Parameters

##### id

`string`

##### options

[`SpawnOptions`](/api/transport/src/interfaces/spawnoptions/)

#### Returns

`Promise`\<[`IProcessHandle`](/api/transport/src/interfaces/iprocesshandle/)\>

#### Implementation of

[`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/).[`spawn`](/api/transport/src/interfaces/iprocessmanager/#spawn)

***

### terminate()

> **terminate**(`id`): `Promise`\<`void`\>

Defined in: [transport/src/process/manager.ts:155](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L155)

Terminates a managed process.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/).[`terminate`](/api/transport/src/interfaces/iprocessmanager/#terminate)

***

### terminateAll()

> **terminateAll**(): `Promise`\<`void`\>

Defined in: [transport/src/process/manager.ts:173](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/manager.ts#L173)

Terminates all managed processes.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IProcessManager`](/api/transport/src/interfaces/iprocessmanager/).[`terminateAll`](/api/transport/src/interfaces/iprocessmanager/#terminateall)
