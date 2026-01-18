---
editUrl: false
next: false
prev: false
title: "createPipeChannel"
---

> **createPipeChannel**(`path`, `options?`): `Promise`\<[`Channel`](/api/transport/src/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\>\>

Defined in: [transport/src/channel/quickstart.ts:125](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/quickstart.ts#L125)

Creates a ready-to-use pipe/socket channel with sensible defaults.

- Transport: SocketTransport (connects to named pipe/unix socket)
- Framing: LengthPrefixedFraming (best for binary/large data)
- Serialization: JsonCodec
- Protocol: JsonRpcProtocol

Platform-specific paths:
- Windows: `\\\\.\\pipe\\my-pipe`
- Unix: `/tmp/my-socket.sock`

The channel is automatically started and ready to send/receive messages.

## Parameters

### path

`string`

Pipe/socket path

### options?

[`PipeChannelOptions`](/api/transport/src/interfaces/pipechanneloptions/)

Optional configuration

## Returns

`Promise`\<[`Channel`](/api/transport/src/interfaces/channel/)\<`unknown`, `unknown`, `unknown`\>\>

Started channel instance

## Example

```ts
const path = isWindows()
  ? '\\\\.\\pipe\\my-app'
  : '/tmp/my-app.sock';

const channel = await createPipeChannel(path, {
  connectionTimeout: 5000,
  timeout: 10000
});

const result = await channel.request('getStatus');
console.log(result);

await channel.close();
```
