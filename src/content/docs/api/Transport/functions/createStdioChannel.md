---
editUrl: false
next: false
prev: false
title: "createStdioChannel"
---

> **createStdioChannel**(`executablePath`, `options?`): `Promise`\<[`Channel`](/api/transport/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\>\>

Defined in: [transport/src/channel/quickstart.ts:68](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L68)

Creates a ready-to-use stdio channel with sensible defaults.

- Transport: StdioTransport (spawns child process)
- Framing: LineDelimitedFraming (best for JSON-RPC over stdio)
- Serialization: JsonCodec
- Protocol: JsonRpcProtocol

The channel is automatically started and ready to send/receive messages.

## Parameters

### executablePath

`string`

Path to executable to spawn

### options?

[`StdioChannelOptions`](/api/transport/interfaces/stdiochanneloptions/)

Optional configuration

## Returns

`Promise`\<[`Channel`](/api/transport/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\>\>

Started channel instance

## Example

```ts
const channel = await createStdioChannel('node', {
  args: ['worker.js'],
  cwd: process.cwd(),
  timeout: 5000
});

const result = await channel.request('calculate', { expr: '2+2' });
console.log(result); // 4

await channel.close();
```
