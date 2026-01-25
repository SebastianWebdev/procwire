# @procwire/codec-msgpack

## 0.2.2

### Patch Changes

- Updated dependencies [[`be7cd05`](https://github.com/SebastianWebdev/procwire/commit/be7cd05c9f057a6a900bdab582a2914f9b1ca19c)]:
  - @procwire/transport@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`3bb167b`](https://github.com/SebastianWebdev/procwire/commit/3bb167b4ff333a6c27dbf3cc509b19d54f23e8be)]:
  - @procwire/transport@0.2.0

## 0.2.0

### Minor Changes

- [#24](https://github.com/SebastianWebdev/procwire/pull/24) [`84f7267`](https://github.com/SebastianWebdev/procwire/commit/84f7267969a19b01d4bc581278d9693264bedf3d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - ### @procwire/codec-msgpack
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

## 0.1.3

### Patch Changes

- [#8](https://github.com/SebastianWebdev/procwire/pull/8) [`4317aa6`](https://github.com/SebastianWebdev/procwire/commit/4317aa68c2026d0f31789eeaf219a9edcadcfec0) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Added `provenance: true` to publish configuration to support npm Trusted Publishing.

- Updated dependencies [[`4317aa6`](https://github.com/SebastianWebdev/procwire/commit/4317aa68c2026d0f31789eeaf219a9edcadcfec0)]:
  - @procwire/transport@0.1.3

## 0.1.2

### Patch Changes

- [#5](https://github.com/SebastianWebdev/procwire/pull/5) [`054ff80`](https://github.com/SebastianWebdev/procwire/commit/054ff8084b01ea9525089db7b1d15d75e98fae1a) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Update homepage urls

- Updated dependencies [[`054ff80`](https://github.com/SebastianWebdev/procwire/commit/054ff8084b01ea9525089db7b1d15d75e98fae1a), [`100a3e6`](https://github.com/SebastianWebdev/procwire/commit/100a3e6e22f7405aa48d344eb4f03a83c92b043b), [`b64c7a7`](https://github.com/SebastianWebdev/procwire/commit/b64c7a7bd1f4a56df734ae6c09e0ed692b0819d0), [`f9f96b4`](https://github.com/SebastianWebdev/procwire/commit/f9f96b40833fa2f3979c6bd0b165f02b598fd66f), [`ea63619`](https://github.com/SebastianWebdev/procwire/commit/ea63619eea639107311f4c749a6b3fa2c952c253)]:
  - @procwire/transport@0.1.2

## 0.1.1

### Patch Changes

- Downgrade to 0.1.0 (initial development phase)

- Updated dependencies []:
  - @procwire/transport@0.1.1

## 1.0.0

### Major Changes

- e2a9b04: Initial release of @procwire packages

  This is the first public release of the @procwire monorepo, providing modular IPC building blocks for Node.js.

  **Core Package:**
  - `@procwire/transport` - Zero-dependency IPC transport library
    - Multiple transports: stdio, named pipes (Windows), Unix sockets (Linux/macOS)
    - Pluggable framing: line-delimited, length-prefixed
    - Built-in serialization: JSON, raw binary
    - Protocol support: JSON-RPC 2.0, custom protocols
    - ProcessManager with configurable restart policies
    - Full TypeScript support with comprehensive type definitions

  **Codec Packages:**
  - `@procwire/codec-msgpack` - MessagePack serialization codec (20-50% smaller than JSON)
  - `@procwire/codec-protobuf` - Protocol Buffers codec with schema validation
  - `@procwire/codec-arrow` - Apache Arrow IPC codec for columnar data

  **Features:**
  - Modular architecture - replace any layer independently
  - Type-safe with full TypeScript generics
  - Cross-platform support (Windows, macOS, Linux)
  - Zero runtime dependencies in core package
  - Production-ready with error handling and process management

### Patch Changes

- Updated dependencies [e2a9b04]
  - @procwire/transport@1.0.0
