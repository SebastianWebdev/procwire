---
editUrl: false
next: false
prev: false
title: "Transport"
---

@procwire/transport

Core IPC transport library with zero runtime dependencies.
Provides modular, type-safe building blocks for inter-process communication.

Architecture layers (bottom to top):
- Transport: Raw byte transfer (stdio, pipes, sockets)
- Framing: Message boundary detection
- Serialization: Object <-> binary conversion
- Protocol: Request/response messaging
- Channel: High-level communication API
- Process: Child process lifecycle management

## Classes

- [AspectIpcError](/api/transport/classes/aspectipcerror/)
- [ChannelBuilder](/api/transport/classes/channelbuilder/)
- [CodecRegistry](/api/transport/classes/codecregistry/)
- [CompositeDisposable](/api/transport/classes/compositedisposable/)
- [EventEmitter](/api/transport/classes/eventemitter/)
- [FramingError](/api/transport/classes/framingerror/)
- [JsonCodec](/api/transport/classes/jsoncodec/)
- [JsonRpcProtocol](/api/transport/classes/jsonrpcprotocol/)
- [JsonRpcResponseAccessor](/api/transport/classes/jsonrpcresponseaccessor/)
- [LengthPrefixedFraming](/api/transport/classes/lengthprefixedframing/)
- [LineDelimitedFraming](/api/transport/classes/linedelimitedframing/)
- [PipePath](/api/transport/classes/pipepath/)
- [ProcessHandle](/api/transport/classes/processhandle/)
- [ProcessManager](/api/transport/classes/processmanager/)
- [ProtocolError](/api/transport/classes/protocolerror/)
- [RawCodec](/api/transport/classes/rawcodec/)
- [RequestChannel](/api/transport/classes/requestchannel/)
- [SerializationError](/api/transport/classes/serializationerror/)
- [SimpleProtocol](/api/transport/classes/simpleprotocol/)
- [SimpleResponseAccessor](/api/transport/classes/simpleresponseaccessor/)
- [SocketServer](/api/transport/classes/socketserver/)
- [SocketTransport](/api/transport/classes/sockettransport/)
- [StdioTransport](/api/transport/classes/stdiotransport/)
- [TimeoutError](/api/transport/classes/timeouterror/)
- [TransportError](/api/transport/classes/transporterror/)
- [TransportFactory](/api/transport/classes/transportfactory/)

## Interfaces

- [Channel](/api/transport/interfaces/channel/)
- [ChannelConfig](/api/transport/interfaces/channelconfig/)
- [ChannelEvents](/api/transport/interfaces/channelevents/)
- [ChannelMiddleware](/api/transport/interfaces/channelmiddleware/)
- [ChannelOptions](/api/transport/interfaces/channeloptions/)
- [ChannelServer](/api/transport/interfaces/channelserver/)
- [ChannelServerOptions](/api/transport/interfaces/channelserveroptions/)
- [DataChannelConfig](/api/transport/interfaces/datachannelconfig/)
- [DisposableLike](/api/transport/interfaces/disposablelike/)
- [EventMap](/api/transport/interfaces/eventmap/)
- [FramingCodec](/api/transport/interfaces/framingcodec/)
- [IProcessHandle](/api/transport/interfaces/iprocesshandle/)
- [IProcessManager](/api/transport/interfaces/iprocessmanager/)
- [JsonCodecOptions](/api/transport/interfaces/jsoncodecoptions/)
- [JsonRpcErrorResponse](/api/transport/interfaces/jsonrpcerrorresponse/)
- [JsonRpcNotification](/api/transport/interfaces/jsonrpcnotification/)
- [JsonRpcRequest](/api/transport/interfaces/jsonrpcrequest/)
- [JsonRpcResponse](/api/transport/interfaces/jsonrpcresponse/)
- [LengthPrefixedFramingOptions](/api/transport/interfaces/lengthprefixedframingoptions/)
- [LineDelimitedFramingOptions](/api/transport/interfaces/linedelimitedframingoptions/)
- [PipeChannelOptions](/api/transport/interfaces/pipechanneloptions/)
- [ProcessHandleEvents](/api/transport/interfaces/processhandleevents/)
- [ProcessManagerConfig](/api/transport/interfaces/processmanagerconfig/)
- [ProcessManagerEvents](/api/transport/interfaces/processmanagerevents/)
- [Protocol](/api/transport/interfaces/protocol/)
- [ProtocolDataError](/api/transport/interfaces/protocoldataerror/)
- [ResponseAccessor](/api/transport/interfaces/responseaccessor/)
- [RestartPolicy](/api/transport/interfaces/restartpolicy/)
- [SerializationCodec](/api/transport/interfaces/serializationcodec/)
- [ServerAddress](/api/transport/interfaces/serveraddress/)
- [SimpleErrorResponse](/api/transport/interfaces/simpleerrorresponse/)
- [SimpleNotification](/api/transport/interfaces/simplenotification/)
- [SimpleRequest](/api/transport/interfaces/simplerequest/)
- [SimpleResponse](/api/transport/interfaces/simpleresponse/)
- [SocketServerOptions](/api/transport/interfaces/socketserveroptions/)
- [SocketTransportOptions](/api/transport/interfaces/sockettransportoptions/)
- [SpawnOptions](/api/transport/interfaces/spawnoptions/)
- [StdioChannelOptions](/api/transport/interfaces/stdiochanneloptions/)
- [StdioTransportEvents](/api/transport/interfaces/stdiotransportevents/)
- [StdioTransportOptions](/api/transport/interfaces/stdiotransportoptions/)
- [TimeoutOptions](/api/transport/interfaces/timeoutoptions/)
- [Transport](/api/transport/interfaces/transport/)
- [TransportEvents](/api/transport/interfaces/transportevents/)
- [TransportServer](/api/transport/interfaces/transportserver/)
- [TransportServerEvents](/api/transport/interfaces/transportserverevents/)

## Type Aliases

- [EventHandler](/api/transport/type-aliases/eventhandler/)
- [JsonRpcResponseMessage](/api/transport/type-aliases/jsonrpcresponsemessage/)
- [NotificationHandler](/api/transport/type-aliases/notificationhandler/)
- [ParsedMessage](/api/transport/type-aliases/parsedmessage/)
- [ProcessState](/api/transport/type-aliases/processstate/)
- [RequestHandler](/api/transport/type-aliases/requesthandler/)
- [RequestId](/api/transport/type-aliases/requestid/)
- [SimpleResponseMessage](/api/transport/type-aliases/simpleresponsemessage/)
- [TransportState](/api/transport/type-aliases/transportstate/)
- [Unsubscribe](/api/transport/type-aliases/unsubscribe/)

## Variables

- [JsonRpcErrorCodes](/api/transport/variables/jsonrpcerrorcodes/)
- [TRANSPORT\_STATE\_TRANSITIONS](/api/transport/variables/transport_state_transitions/)

## Functions

- [assertState](/api/transport/functions/assertstate/)
- [createPipeChannel](/api/transport/functions/createpipechannel/)
- [createStdioChannel](/api/transport/functions/createstdiochannel/)
- [createTimeoutSignal](/api/transport/functions/createtimeoutsignal/)
- [createUnsubscribe](/api/transport/functions/createunsubscribe/)
- [getPlatform](/api/transport/functions/getplatform/)
- [isUnix](/api/transport/functions/isunix/)
- [isWindows](/api/transport/functions/iswindows/)
- [sleep](/api/transport/functions/sleep/)
- [toError](/api/transport/functions/toerror/)
- [transitionState](/api/transport/functions/transitionstate/)
- [withTimeout](/api/transport/functions/withtimeout/)
