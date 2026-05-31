---
title: Getting Started
description: Getting started guide for Procwire
sidebar:
  order: 0
---

## Features

Procwire provides:

- **Binary protocol** for the data plane (JSON-RPC only on the control plane)
- **Builder pattern** for a type-safe API
- **Response types**: none, ack, result, stream
- **Cancellation** with AbortController support
- **Target performance**: >1 GB/s for large payloads

## Installation

```bash
# Core packages
pnpm add @procwire/core @procwire/client

# Optional: codecs are included, but can install separately
pnpm add @procwire/codecs

# Low-level protocol (usually not needed directly)
pnpm add @procwire/protocol
```

## Quick Start

Documentation coming soon. For development progress, see the [GitHub repository](https://github.com/SebastianWebdev/procwire).
