# Channel Performance Benchmark Report

**Generated:** 2026-01-26T20:10:11.832Z

## System Information

| Property | Value |
|----------|-------|
| Platform | win32 |
| Architecture | x64 |
| CPU | AMD Ryzen 9 7900X 12-Core Processor             |
| CPU Cores | 24 |
| Total Memory | 63.1 GB |
| Node.js | v24.11.1 |

## Summary Comparison

| Test | Payload | Control (ms) | Data (ms) | Speedup | Throughput Diff |
|------|---------|--------------|-----------|---------|-----------------|
| payload_1KB_1KB | 1 KB | 0.21 | 0.16 | **1.26x faster** | +26.3% |
| payload_10KB_10KB | 10 KB | 0.23 | 0.26 | 0.89x | -11.2% |
| payload_100KB_100KB | 100 KB | 0.78 | 0.75 | **1.05x faster** | +4.6% |
| payload_500KB_500KB | 500 KB | 3.48 | 3.53 | 0.99x | -1.3% |
| payload_1024KB_1024KB | 1024 KB | 8.40 | 8.38 | **1.00x faster** | +0.3% |
| payload_2048KB_2048KB | 2048 KB | 17.53 | 16.46 | **1.06x faster** | +6.5% |
| payload_5120KB_5120KB | 5120 KB | 63.85 | 61.91 | **1.03x faster** | +3.1% |
| payload_10240KB_10240KB | 10240 KB | 203.03 | 180.75 | **1.12x faster** | +12.3% |
| payload_51200KB_51200KB | 51200 KB | 4178.35 | 3494.57 | **1.20x faster** | +19.6% |
| payload_102400KB_102400KB | 102400 KB | 17137.71 | 13914.02 | **1.23x faster** | +23.2% |
| throughput_100_0KB | minimal | 2.51 | 3.16 | 0.80x | -14.1% |
| throughput_500_0KB | minimal | 7.30 | 9.48 | 0.77x | -19.6% |
| throughput_1000_0KB | minimal | 10.78 | 12.87 | 0.84x | -5.1% |
| throughput_2000_0KB | minimal | 21.46 | 22.31 | 0.96x | +18.7% |

## Detailed Results

### Payload Transfer Performance

| Channel | Payload | Iterations | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Throughput (MB/s) |
|---------|---------|------------|----------|----------|----------|----------|-------------------|
| control | 1 KB | 50 | 0.21 | 0.18 | 0.50 | 0.63 | 4.67 |
| data | 1 KB | 50 | 0.16 | 0.16 | 0.25 | 0.31 | 5.90 |
| control | 10 KB | 50 | 0.23 | 0.21 | 0.32 | 0.35 | 42.85 |
| data | 10 KB | 50 | 0.26 | 0.21 | 0.53 | 1.11 | 38.04 |
| control | 100 KB | 50 | 0.78 | 0.76 | 1.15 | 1.25 | 124.33 |
| data | 100 KB | 50 | 0.75 | 0.73 | 0.98 | 1.48 | 129.99 |
| control | 500 KB | 50 | 3.48 | 3.27 | 5.32 | 5.49 | 140.31 |
| data | 500 KB | 50 | 3.53 | 3.46 | 4.19 | 4.96 | 138.42 |
| control | 1024 KB | 50 | 8.40 | 7.83 | 12.44 | 13.58 | 118.97 |
| data | 1024 KB | 50 | 8.38 | 7.85 | 11.57 | 12.59 | 119.30 |
| control | 2048 KB | 50 | 17.53 | 17.41 | 19.05 | 20.37 | 114.08 |
| data | 2048 KB | 50 | 16.46 | 16.45 | 17.96 | 18.91 | 121.47 |
| control | 5120 KB | 20 | 63.85 | 63.81 | 67.32 | 67.75 | 78.31 |
| data | 5120 KB | 20 | 61.91 | 60.62 | 70.79 | 75.04 | 80.76 |
| control | 10240 KB | 10 | 203.03 | 204.05 | 212.22 | 212.22 | 49.25 |
| data | 10240 KB | 10 | 180.75 | 178.64 | 191.68 | 191.68 | 55.33 |
| control | 51200 KB | 5 | 4178.35 | 4183.55 | 4232.94 | 4232.94 | 11.97 |
| data | 51200 KB | 5 | 3494.57 | 3422.73 | 3753.02 | 3753.02 | 14.31 |
| control | 102400 KB | 5 | 17137.71 | 17219.05 | 17396.33 | 17396.33 | 5.84 |
| data | 102400 KB | 5 | 13914.02 | 13934.05 | 14016.93 | 14016.93 | 7.19 |

### Message Throughput Performance

| Channel | Messages | Total (ms) | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Messages/sec |
|---------|----------|------------|----------|----------|----------|----------|--------------|
| control | 100 | 3 | 2.51 | 2.50 | 2.76 | 2.79 | 32617 |
| data | 100 | 4 | 3.16 | 3.20 | 3.42 | 3.44 | 28009 |
| control | 500 | 9 | 7.30 | 7.41 | 8.22 | 8.27 | 58196 |
| data | 500 | 11 | 9.48 | 9.49 | 10.04 | 10.09 | 46781 |
| control | 1000 | 14 | 10.78 | 11.52 | 12.29 | 12.40 | 73343 |
| data | 1000 | 14 | 12.87 | 12.86 | 14.00 | 14.04 | 69592 |
| control | 2000 | 31 | 21.46 | 24.25 | 29.37 | 29.76 | 64655 |
| data | 2000 | 26 | 22.31 | 22.09 | 25.38 | 25.52 | 76770 |

## Interpretation

- **Speedup > 1**: Data channel is faster than control channel
- **Speedup < 1**: Control channel is faster than data channel
- **Throughput Diff**: Positive means data channel has higher throughput

### Notes

- Control channel uses stdio (stdin/stdout) with line-delimited framing
- Data channel uses named pipes (Windows) or Unix sockets with length-prefixed framing
- Length-prefixed framing is more efficient for binary/large payloads
- Results may vary based on system load and hardware