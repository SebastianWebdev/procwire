---
"@procwire/codec-msgpack": minor
"@procwire/codec-protobuf": minor
"@procwire/codec-arrow": minor
---

### @procwire/codec-msgpack

- Add generic type support (`MessagePackCodec<T>`) for type-safe serialization
- Add built-in extension codecs for Date, Map, Set, and BigInt via `createExtendedCodec()`
- Add `createCommonExtensionCodec()` for custom extension configurations
- Add input validation in `deserialize()` method
- Expand test coverage from 9 to 88 tests

### @procwire/codec-protobuf

- Add `ProtobufCodecOptions` interface with configurable settings:
  - `longs`: Convert int64/uint64 to String (default) or Number
  - `enums`: Convert enum values to string names
  - `bytes`: Convert bytes to String (base64), Array, or Uint8Array
  - `defaults`: Include default values in output
  - `oneofs`: Include virtual oneof field names
  - `verifyOnSerialize`: Verify message before encoding (default: true)
- Add zero-copy buffer optimization in `serialize()`
- Add helper functions: `createCodecFromProto()`, `createCodecFromJSON()`
- Add comprehensive test suite (103 tests)

### @procwire/codec-arrow

- Add zero-copy serialization using `Buffer.from(buffer, offset, length)`
- Add configurable IPC format (stream/file) with stream as default
- Add `validateInput` option to disable validation for max performance
- Add `collectMetrics` option for throughput monitoring with `ArrowCodecMetrics`
- Add helper functions: `createFastArrowCodec`, `createMonitoredArrowCodec`, `createFileArrowCodec`
- Add comprehensive tests for validation, performance, and metrics
