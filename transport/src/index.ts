/**
 * @aspect-ipc/transport
 *
 * Core IPC transport library with zero runtime dependencies.
 * Provides modular, type-safe building blocks for inter-process communication.
 *
 * Architecture layers (bottom to top):
 * - Transport: Raw byte transfer (stdio, pipes, sockets)
 * - Framing: Message boundary detection
 * - Serialization: Object <-> binary conversion
 * - Protocol: Request/response messaging
 * - Channel: High-level communication API
 * - Process: Child process lifecycle management
 *
 * @packageDocumentation
 */

// Core types
export * from "./transport/index.js";
export * from "./framing/index.js";
export * from "./serialization/index.js";
export * from "./protocol/index.js";
export * from "./channel/index.js";
export * from "./process/index.js";

// Utilities
export * from "./utils/index.js";
