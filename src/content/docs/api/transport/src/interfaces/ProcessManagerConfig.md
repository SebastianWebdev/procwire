---
editUrl: false
next: false
prev: false
title: "ProcessManagerConfig"
---

Defined in: [transport/src/process/types.ts:159](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L159)

Process manager configuration.

## Properties

### defaultTimeout?

> `optional` **defaultTimeout**: `number`

Defined in: [transport/src/process/types.ts:164](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L164)

Default request timeout for all channels.

#### Default

```ts
30000
```

***

### gracefulShutdownMs?

> `optional` **gracefulShutdownMs**: `number`

Defined in: [transport/src/process/types.ts:181](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L181)

Graceful shutdown timeout in milliseconds.

#### Default

```ts
5000
```

***

### namespace?

> `optional` **namespace**: `string`

Defined in: [transport/src/process/types.ts:175](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L175)

Namespace for auto-generated pipe paths.

#### Default

```ts
'procwire'
```

***

### restartPolicy?

> `optional` **restartPolicy**: [`RestartPolicy`](/api/transport/src/interfaces/restartpolicy/)

Defined in: [transport/src/process/types.ts:169](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L169)

Default restart policy for all processes.
