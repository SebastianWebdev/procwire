---
editUrl: false
next: false
prev: false
title: "StdioTransportOptions"
---

Defined in: [transport/src/transport/stdio-transport.ts:10](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L10)

Stdio transport options for child process communication.

## Properties

### args?

> `optional` **args**: `string`[]

Defined in: [transport/src/transport/stdio-transport.ts:19](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L19)

Command line arguments.

***

### cwd?

> `optional` **cwd**: `string`

Defined in: [transport/src/transport/stdio-transport.ts:24](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L24)

Working directory for child process.

***

### env?

> `optional` **env**: `Record`\<`string`, `string`\>

Defined in: [transport/src/transport/stdio-transport.ts:29](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L29)

Environment variables.

***

### executablePath

> **executablePath**: `string`

Defined in: [transport/src/transport/stdio-transport.ts:14](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L14)

Path to executable to spawn.

***

### maxStderrBuffer?

> `optional` **maxStderrBuffer**: `number`

Defined in: [transport/src/transport/stdio-transport.ts:49](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L49)

Maximum stderr buffer size in bytes.
If exceeded, transport will emit error and disconnect.

#### Default

```ts
1MB
```

***

### maxStdoutBuffer?

> `optional` **maxStdoutBuffer**: `number`

Defined in: [transport/src/transport/stdio-transport.ts:42](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L42)

Maximum stdout buffer size in bytes.
If exceeded, transport will emit error and disconnect.

#### Default

```ts
10MB
```

***

### startupTimeout?

> `optional` **startupTimeout**: `number`

Defined in: [transport/src/transport/stdio-transport.ts:35](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L35)

Timeout for process startup in milliseconds.

#### Default

```ts
10000
```
