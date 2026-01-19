---
editUrl: false
next: false
prev: false
title: "PipePath"
---

Defined in: [transport/src/utils/pipe-path.ts:10](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/pipe-path.ts#L10)

Cross-platform pipe path utilities for Named Pipes (Windows) and Unix Domain Sockets.

Provides consistent path generation and cleanup across platforms.

## Constructors

### Constructor

> **new PipePath**(): `PipePath`

#### Returns

`PipePath`

## Methods

### cleanup()

> `static` **cleanup**(`pipePath`): `Promise`\<`void`\>

Defined in: [transport/src/utils/pipe-path.ts:56](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/pipe-path.ts#L56)

Cleans up a pipe/socket path (Unix only).

On Unix, removes the socket file if it exists.
On Windows, this is a no-op (Named Pipes are virtual).

#### Parameters

##### pipePath

`string`

Path to clean up

#### Returns

`Promise`\<`void`\>

#### Example

```ts
await PipePath.cleanup('/tmp/my-socket.sock');
```

***

### forModule()

> `static` **forModule**(`namespace`, `moduleId`): `string`

Defined in: [transport/src/utils/pipe-path.ts:28](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/pipe-path.ts#L28)

Generates a platform-specific pipe/socket path for a module.

Windows: `\\.\pipe\<namespace>-<moduleId>`
Unix: `/tmp/<namespace>-<moduleId>.sock`

#### Parameters

##### namespace

`string`

Application namespace (e.g., 'procwire')

##### moduleId

`string`

Module identifier (e.g., 'worker-1')

#### Returns

`string`

Platform-specific pipe/socket path

#### Example

```ts
// Windows: \\.\pipe\procwire-worker-1
// Unix: /tmp/procwire-worker-1.sock
const path = PipePath.forModule('procwire', 'worker-1');
```
