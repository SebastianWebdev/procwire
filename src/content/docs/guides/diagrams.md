---
title: Architecture Diagrams
description: Visual diagrams of Procwire Transport architecture using D2
---

# Architecture Diagrams

This page contains all architecture diagrams in D2 format. These diagrams visualize the layered architecture, data flow, and class relationships in @procwire/transport.

## Layered Architecture Overview

```d2
direction: down

app: Application Layer {
  ProcessManager
  ModuleHandle
  ChannelPair
  ConnectionPool
}

channel: Channel Layer {
  RequestChannel
  StreamChannel
  NotificationChannel
}

protocol: Protocol Layer {
  JsonRpcProtocol
  BinaryProtocol
  CustomProtocol
}

serialization: Serialization Layer {
  JsonCodec
  MessagePackCodec
  ProtobufCodec
  ArrowCodec
}

framing: Framing Layer {
  LineDelimitedFraming
  LengthPrefixedFraming
}

transport: Transport Layer {
  StdioTransport
  NamedPipeTransport
  UnixSocketTransport
}

os: OS Layer {
  stdin: process.stdin
  stdout: process.stdout
  net: net.Server
  child: child_process
}

app -> channel
channel -> protocol
protocol -> serialization
serialization -> framing
framing -> transport
transport -> os
```

## Data Flow

```d2
direction: right

Application
Channel
Protocol
Transport

Application -> Channel: request
Channel -> Protocol: encode
Protocol -> Transport: write
Transport -> Protocol: read
Protocol -> Channel: deserialize
Channel -> Application: response
```

## Transport Layer

```d2
Transport: {
  shape: class
  state TransportState
  connect
  disconnect
  write
  onData
  on
}

StdioTransport: {
  shape: class
  process
  stdin
  stdout
  spawn
  kill
}

NamedPipeTransport: {
  shape: class
  pipePath string
  server Server
  client Socket
  listen
  connect
}

UnixSocketTransport: {
  shape: class
  socketPath
  socket
  isServer
  listen
  connect
}

Transport -> StdioTransport: implements
Transport -> NamedPipeTransport: implements
Transport -> UnixSocketTransport: implements
```

## Transport Server

```d2
TransportServer: {
  shape: class
  isListening boolean
  address string
  listen
  close
  onConnection
}

NamedPipeServer: {
  shape: class
  pipePath string
  server
  connections Set
}

UnixSocketServer: {
  shape: class
  socketPath string
  server
  connections Set
}

TransportServer -> NamedPipeServer: implements
TransportServer -> UnixSocketServer: implements
```

## Framing Layer

```d2
FramingCodec: {
  shape: class
  name string
  encode
  decode
  reset
  hasBufferedData
  getBufferSize
}

LineDelimitedFraming: {
  shape: class
  buffer Buffer
  maxBufferSize number
  delimiter number
}

LengthPrefixedFraming: {
  shape: class
  buffer Buffer
  maxMessageSize number
  headerSize number
}

FramingCodec -> LineDelimitedFraming: implements
FramingCodec -> LengthPrefixedFraming: implements
```

## Serialization Layer

```d2
SerializationCodec: {
  shape: class
  name string
  contentType string
  serialize
  deserialize
}

JsonCodec: {
  shape: class
  contentType json
}

MsgPackCodec: {
  shape: class
  contentType msgpack
}

ProtobufCodec: {
  shape: class
  contentType protobuf
}

ArrowCodec: {
  shape: class
  contentType arrow
}

RawCodec: {
  shape: class
  contentType octet
}

SerializationCodec -> JsonCodec: implements
SerializationCodec -> MsgPackCodec: implements
SerializationCodec -> ProtobufCodec: implements
SerializationCodec -> ArrowCodec: implements
SerializationCodec -> RawCodec: implements
```

## Protocol Layer

```d2
Protocol: {
  shape: class
  name string
  version string
  createRequest
  createResponse
  createErrorResponse
  createNotification
  parseMessage
  isRequest
  isResponse
  isNotification
}

JsonRpcProtocol: {
  shape: class
  version string
}

BinaryProtocol: {
  shape: class
  version string
}

SimpleProtocol: {
  shape: class
  version string
}

Protocol -> JsonRpcProtocol: implements
Protocol -> BinaryProtocol: implements
Protocol -> SimpleProtocol: implements
```

## Channel Layer

```d2
Channel: {
  shape: class
  isConnected boolean
  start
  close
  request
  notify
  onRequest
  onNotification
  on
}

RequestChannel: {
  shape: class
  transport Transport
  framing FramingCodec
  serializer Codec
  protocol Protocol
  pendingRequests Map
  requestTimeout number
}

StreamChannel: {
  shape: class
  transport Transport
  framing FramingCodec
  serializer Codec
  protocol Protocol
}

Channel -> RequestChannel: implements
Channel -> StreamChannel: implements
```

## Application Layer

```d2
ProcessManager: {
  shape: class
  processes Map
  config ProcessManagerConfig
  spawn
  terminate
  terminateAll
  getHandle
  isRunning
  on
}

ProcessHandle: {
  shape: class
  id string
  pid number
  state ProcessState
  controlChannel Channel
  dataChannel Channel
  request
  requestViaData
  notify
  on
}

ControlChannel: {
  shape: class
  transport stdio
}

DataChannel: {
  shape: class
  transport pipe
}

ProcessManager -> ProcessHandle: manages
ProcessHandle -> ControlChannel: uses
ProcessHandle -> DataChannel: uses
```

## Complete System Overview

```d2
direction: down

app: Application
channels: Channels
protocols: Protocols
codecs: Serialization
framing: Framing
transports: Transports

app -> channels
channels -> protocols
protocols -> codecs
codecs -> framing
framing -> transports

app.ProcessManager
app.ProcessHandle
app.ChannelPair

channels.RequestChannel
channels.StreamChannel
channels.NotificationChannel

protocols.JsonRpc
protocols.Binary
protocols.Custom

codecs.JSON
codecs.MessagePack
codecs.Protobuf
codecs.Arrow

framing.LineDelimited
framing.LengthPrefixed

transports.Stdio
transports.NamedPipe
transports.UnixSocket
```
