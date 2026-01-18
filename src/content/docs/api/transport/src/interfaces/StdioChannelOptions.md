---
editUrl: false
next: false
prev: false
title: "StdioChannelOptions"
---

Defined in: [transport/src/channel/quickstart.ts:14](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L14)

Options for stdio channel creation.

## Extends

- `Omit`\<[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/), `"executablePath"`\>

## Properties

### args?

> `optional` **args**: `string`[]

Defined in: [transport/src/transport/stdio-transport.ts:19](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L19)

Command line arguments.

#### Inherited from

[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/).[`args`](/api/transport/src/interfaces/stdiotransportoptions/#args)

***

### cwd?

> `optional` **cwd**: `string`

Defined in: [transport/src/transport/stdio-transport.ts:24](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L24)

Working directory for child process.

#### Inherited from

[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/).[`cwd`](/api/transport/src/interfaces/stdiotransportoptions/#cwd)

***

### env?

> `optional` **env**: `Record`\<`string`, `string`\>

Defined in: [transport/src/transport/stdio-transport.ts:29](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L29)

Environment variables.

#### Inherited from

[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/).[`env`](/api/transport/src/interfaces/stdiotransportoptions/#env)

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

#### Inherited from

[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/).[`maxStderrBuffer`](/api/transport/src/interfaces/stdiotransportoptions/#maxstderrbuffer)

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

#### Inherited from

[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/).[`maxStdoutBuffer`](/api/transport/src/interfaces/stdiotransportoptions/#maxstdoutbuffer)

***

### startupTimeout?

> `optional` **startupTimeout**: `number`

Defined in: [transport/src/transport/stdio-transport.ts:35](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L35)

Timeout for process startup in milliseconds.

#### Default

```ts
10000
```

#### Inherited from

[`StdioTransportOptions`](/api/transport/src/interfaces/stdiotransportoptions/).[`startupTimeout`](/api/transport/src/interfaces/stdiotransportoptions/#startuptimeout)

***

### timeout?

> `optional` **timeout**: `number`

Defined in: [transport/src/channel/quickstart.ts:20](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L20)

Request timeout in milliseconds.

#### Default

```ts
30000
```
