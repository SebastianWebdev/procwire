import { describe, it, expect } from "vitest";
import { DEFAULT_SCENARIOS, QUICK_SCENARIOS, type BenchmarkScenario } from "@procwire/bench";
import { resolveRunConcurrency, toBenchmarkScenario } from "../src/server/runner-bridge.js";
import type { ScenarioInfo } from "../src/server/types.js";

function byId(list: BenchmarkScenario[], id: string): BenchmarkScenario {
  const found = list.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario: ${id}`);
  return found;
}

/** Builds the presentational ScenarioInfo the dashboard would send for a catalog id. */
function infoFor(id: string): ScenarioInfo {
  const s = byId(DEFAULT_SCENARIOS, id);
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    sizes: s.sizes,
    codecs: s.codecs,
    modes: s.modes,
    category: s.category,
  };
}

describe("toBenchmarkScenario", () => {
  it("keeps full canonical iterations for built-in scenarios by default", () => {
    const canonical = byId(DEFAULT_SCENARIOS, "latency-baseline");
    const result = toBenchmarkScenario(infoFor("latency-baseline"), false);
    expect(result.iterations).toBe(canonical.iterations);
    expect(result.warmup).toBe(canonical.warmup);
  });

  it("uses the reduced quick-mode catalog for built-in scenarios when quick", () => {
    const quick = byId(QUICK_SCENARIOS, "latency-baseline");
    const canonical = byId(DEFAULT_SCENARIOS, "latency-baseline");
    const result = toBenchmarkScenario(infoFor("latency-baseline"), true);
    expect(result.iterations).toBe(quick.iterations);
    expect(result.warmup).toBe(quick.warmup);
    // sanity: quick mode is actually lighter than the full run
    expect(result.iterations).toBeLessThan(canonical.iterations);
  });

  it("preserves scenario concurrency in quick mode (only iterations/warmup change)", () => {
    const canonical = byId(DEFAULT_SCENARIOS, "max-rps");
    const seq = toBenchmarkScenario(infoFor("max-rps"), false);
    const quick = toBenchmarkScenario(infoFor("max-rps"), true);
    expect(seq.concurrency).toBe(canonical.concurrency);
    expect(quick.concurrency).toBe(canonical.concurrency);
  });

  it("falls back to light defaults for unknown (custom) scenario ids", () => {
    const info: ScenarioInfo = {
      id: "custom-not-in-catalog",
      name: "Custom",
      description: "",
      sizes: ["1KB"],
      codecs: ["raw"],
      modes: ["result"],
      category: "benchmark",
    };
    const result = toBenchmarkScenario(info, false);
    expect(result.iterations).toBe(100);
    expect(result.warmup).toBe(10);
  });
});

describe("resolveRunConcurrency", () => {
  it("defaults to 1 for sequential scenarios with no run option", () => {
    expect(resolveRunConcurrency([infoFor("throughput-max")])).toBe(1);
  });

  it("honors a scenario's own concurrency over a lower run option", () => {
    const maxRps = byId(DEFAULT_SCENARIOS, "max-rps");
    expect(resolveRunConcurrency([infoFor("max-rps")], 1)).toBe(maxRps.concurrency);
  });

  it("uses the run option when it exceeds scenario concurrency", () => {
    expect(resolveRunConcurrency([infoFor("throughput-max")], 8)).toBe(8);
  });

  it("takes the peak effective concurrency across a mixed selection", () => {
    const maxRps = byId(DEFAULT_SCENARIOS, "max-rps");
    expect(resolveRunConcurrency([infoFor("throughput-max"), infoFor("max-rps")], 2)).toBe(
      maxRps.concurrency,
    );
  });
});
