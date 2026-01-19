---
editUrl: false
next: false
prev: false
title: "SpawnOptions"
---

Defined in: [transport/src/process/types.ts:111](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L111)

Options for spawning a managed process.

## Properties

### args?

> `optional` **args**: `string`[]

Defined in: [transport/src/process/types.ts:120](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L120)

Command line arguments.

***

### controlChannel?

> `optional` **controlChannel**: [`ChannelConfig`](/api/transport/src/interfaces/channelconfig/)

Defined in: [transport/src/process/types.ts:142](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L142)

Control channel configuration.
Control channel uses stdio transport.

***

### cwd?

> `optional` **cwd**: `string`

Defined in: [transport/src/process/types.ts:125](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L125)

Working directory for the process.

***

### dataChannel?

> `optional` **dataChannel**: [`DataChannelConfig`](/api/transport/src/interfaces/datachannelconfig/)

Defined in: [transport/src/process/types.ts:147](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L147)

Data channel configuration (optional secondary channel).

***

### env?

> `optional` **env**: `Record`\<`string`, `string`\>

Defined in: [transport/src/process/types.ts:130](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L130)

Environment variables.

***

### executablePath

> **executablePath**: `string`

Defined in: [transport/src/process/types.ts:115](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L115)

Path to executable to spawn.

***

### restartPolicy?

> `optional` **restartPolicy**: [`RestartPolicy`](/api/transport/src/interfaces/restartpolicy/)

Defined in: [transport/src/process/types.ts:153](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L153)

Custom restart policy for this process.
Overrides manager default.

***

### startupTimeout?

> `optional` **startupTimeout**: `number`

Defined in: [transport/src/process/types.ts:136](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L136)

Startup timeout in milliseconds.

#### Default

```ts
10000
```
