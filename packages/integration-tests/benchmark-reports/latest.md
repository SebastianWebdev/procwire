# Codec Performance Benchmark Report

## What This Benchmark Measures

This benchmark compares serialization codec performance for IPC (Inter-Process Communication):

| Codec                        | Transport   | Use Case                               |
| ---------------------------- | ----------- | -------------------------------------- |
| 🔴 **JSON/stdio** (baseline) | stdio       | Traditional IPC without procwire       |
| 🟢 **Raw binary** (baseline) | Named Pipes | Maximum theoretical throughput         |
| 🔵 **MessagePack**           | Named Pipes | General-purpose, 2-5x faster than JSON |
| 🟣 **Protobuf**              | Named Pipes | Schema-validated, compact payloads     |
| 🟠 **Arrow**                 | In-memory   | Columnar data, analytics workloads     |

## Key Findings

- 🚀 **Best throughput**: msgpack at **176.6 MB/s** for 1MB+ payloads
- 📊 **vs JSON baseline**: 1.0x faster
- 📉 **vs Raw baseline**: -82% overhead from serialization
- 🟠 **Arrow** (100K+ rows): **4409.4 MB/s** columnar throughput

---

## Baseline Measurements

_These baselines show the performance range: JSON/stdio (minimum) to Raw/pipes (maximum)_

### 🔴 Lower Baseline: JSON over stdio

_Traditional IPC without procwire - line-delimited JSON over stdin/stdout_

| Payload | Avg Latency | P95       | P99       | Throughput |
| ------- | ----------- | --------- | --------- | ---------- |
| 1 KB    | 0.12 ms     | 0.22 ms   | 0.23 ms   | 8.0 MB/s   |
| 10 KB   | 0.14 ms     | 0.21 ms   | 0.24 ms   | 67.8 MB/s  |
| 100 KB  | 0.55 ms     | 0.75 ms   | 1.02 ms   | 178.1 MB/s |
| 1 MB    | 5.91 ms     | 7.81 ms   | 8.27 ms   | 169.0 MB/s |
| 10 MB   | 165.13 ms   | 170.31 ms | 170.31 ms | 60.6 MB/s  |

### 🟢 Upper Baseline: Raw Binary over Named Pipes

_Theoretical maximum - no serialization overhead, just framing_

| Payload | Avg Latency | P95        | P99        | Throughput |
| ------- | ----------- | ---------- | ---------- | ---------- |
| 1 KB    | 0.12 ms     | 0.16 ms    | 0.25 ms    | 8.1 MB/s   |
| 10 KB   | 0.31 ms     | 0.62 ms    | 0.90 ms    | 31.4 MB/s  |
| 100 KB  | 2.40 ms     | 2.83 ms    | 2.98 ms    | 40.7 MB/s  |
| 1 MB    | 32.17 ms    | 33.42 ms   | 35.03 ms   | 31.1 MB/s  |
| 10 MB   | 1087.48 ms  | 1096.50 ms | 1096.50 ms | 9.2 MB/s   |

---

## Codec Performance (via Named Pipes)

### 🔵 MessagePack Codec

_Best for: General-purpose IPC, moderate payloads, Date/Map/Set support_

| Payload | Avg Latency | P95       | P99       | Throughput | vs JSON | vs Raw |
| ------- | ----------- | --------- | --------- | ---------- | ------- | ------ |
| 1 KB    | 0.12 ms     | 0.22 ms   | 0.25 ms   | 8.4 MB/s   | 1.0x    | 103%   |
| 10 KB   | 0.15 ms     | 0.21 ms   | 0.50 ms   | 66.2 MB/s  | 1.0x    | 211%   |
| 100 KB  | 0.51 ms     | 0.62 ms   | 1.09 ms   | 192.6 MB/s | 1.1x    | 473%   |
| 1 MB    | 5.66 ms     | 6.50 ms   | 7.01 ms   | 176.6 MB/s | 1.0x    | 568%   |
| 10 MB   | 137.28 ms   | 141.89 ms | 141.89 ms | 72.8 MB/s  | 1.2x    | 792%   |

### 🟣 Protobuf Codec

_Best for: Schema validation, cross-language, compact payloads_

| Payload | Avg Latency | P95       | P99       | Throughput | vs JSON | vs Raw |
| ------- | ----------- | --------- | --------- | ---------- | ------- | ------ |
| 1 KB    | 0.10 ms     | 0.15 ms   | 0.22 ms   | 9.9 MB/s   | 1.2x    | 122%   |
| 10 KB   | 0.16 ms     | 0.32 ms   | 0.78 ms   | 60.4 MB/s  | 0.9x    | 193%   |
| 100 KB  | 0.51 ms     | 0.67 ms   | 0.93 ms   | 191.2 MB/s | 1.1x    | 469%   |
| 1 MB    | 5.95 ms     | 7.85 ms   | 8.28 ms   | 168.1 MB/s | 1.0x    | 541%   |
| 10 MB   | 138.89 ms   | 142.30 ms | 142.30 ms | 72.0 MB/s  | 1.2x    | 783%   |

---

## Pure Serialization Performance (In-Memory)

_Codec overhead without IPC transport - serialize + deserialize round-trip_

| Codec          | Payload | Avg Latency | Throughput | Serialized Size |
| -------------- | ------- | ----------- | ---------- | --------------- |
| 🔵 MessagePack | 1 KB    | 0.011 ms    | 85.3 MB/s  | 0.9 KB          |
| 🔵 MessagePack | 10 KB   | 0.030 ms    | 325.3 MB/s | 9.9 KB          |
| 🔵 MessagePack | 100 KB  | 0.285 ms    | 342.4 MB/s | 99.9 KB         |
| 🔵 MessagePack | 1 MB    | 1.907 ms    | 524.2 MB/s | 1023.9 KB       |
| 🟣 Protobuf    | 1 KB    | 0.007 ms    | 130.7 MB/s | 0.8 KB          |
| 🟣 Protobuf    | 10 KB   | 0.021 ms    | 453.2 MB/s | 9.8 KB          |
| 🟣 Protobuf    | 100 KB  | 0.111 ms    | 876.6 MB/s | 99.8 KB         |
| 🟣 Protobuf    | 1 MB    | 1.046 ms    | 955.8 MB/s | 1023.8 KB       |

### 🟠 Arrow Codec (Columnar Data)

_Best for: Analytics, batch processing, cross-language data exchange_

_Note: Arrow is tested in isolation (serialize + deserialize round-trip) as it's designed for columnar data, not JSON-RPC._

| Rows | Avg Latency | P95      | P99      | Throughput  | Serialized Size |
| ---- | ----------- | -------- | -------- | ----------- | --------------- |
| 100  | 0.22 ms     | 0.42 ms  | 0.51 ms  | 15.3 MB/s   | 5.0 KB          |
| 1K   | 0.17 ms     | 0.25 ms  | 0.41 ms  | 207.0 MB/s  | 40.2 KB         |
| 10K  | 0.24 ms     | 0.47 ms  | 0.86 ms  | 1417.8 MB/s | 400.6 KB        |
| 100K | 0.78 ms     | 0.86 ms  | 0.86 ms  | 4409.4 MB/s | 4.0 MB          |
| 1.0M | 8.90 ms     | 17.27 ms | 17.27 ms | 3855.5 MB/s | 40.9 MB         |

---

## Message Throughput (Small Messages)

_How many small messages can we send per second?_

| Codec          | 100 msgs     | 500 msgs     | 1000 msgs     |
| -------------- | ------------ | ------------ | ------------- |
| 🔴 JSON/stdio  | 65 738 msg/s | 46 729 msg/s | 111 264 msg/s |
| 🔵 MessagePack | 64 897 msg/s | 56 987 msg/s | 117 684 msg/s |
| 🟣 Protobuf    | 72 322 msg/s | 78 709 msg/s | 115 138 msg/s |

---

## Test Environment

**Generated:** 2026-01-27T20:13:22.174Z

| Property     | Value                               |
| ------------ | ----------------------------------- |
| Platform     | win32                               |
| Architecture | x64                                 |
| CPU          | AMD Ryzen 9 7900X 12-Core Processor |
| CPU Cores    | 24                                  |
| Total Memory | 63.1 GB                             |
| Node.js      | v24.11.1                            |

## Methodology

### Codec Descriptions

- **JSON/stdio**: Line-delimited JSON over stdin/stdout. Baseline for traditional IPC.
- **Raw binary**: Length-prefixed binary over Named Pipes. No serialization, shows transport max.
- **MessagePack**: Binary JSON-like format. 2-5x faster, supports Date/Map/Set.
- **Protobuf**: Schema-validated binary. 3-10x smaller than JSON.
- **Arrow**: Columnar IPC format. Optimized for analytics and batch processing.

### Metrics

- **vs JSON**: Throughput relative to JSON/stdio baseline (higher is better)
- **vs Raw**: Throughput as percentage of raw binary baseline (100% = no serialization overhead)
- **P95/P99**: 95th and 99th percentile latencies (tail latency)

### Test Parameters

- **Warmup**: 5-10 iterations before measurement
- **Iterations**: 50 for small payloads, fewer for large to keep test reasonable
- **Payloads**: 1 KB to 10 MB structured data
- **Arrow**: 100 to 1M rows with 5 columns
