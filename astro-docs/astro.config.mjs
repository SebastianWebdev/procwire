// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc from "starlight-typedoc";
import textPlugin from "astro-d2";
import mermaid from "astro-mermaid";
import starlightLlmsTxt from "starlight-llms-txt";

export default defineConfig({
  site: "https://procwire.dev",

  integrations: [
    textPlugin({
      theme: {
        dark: "200",
        default: "100",
      },
      skipGeneration: false,
    }),
    mermaid(),
    starlight({
      title: "Procwire Docs",

      sidebar: [
        { label: "Guides", autogenerate: { directory: "guides" } },
        {
          label: "API Reference",
          autogenerate: { directory: "api" },
        },
        {
          label: "LLM Context (.txt)",
          link: "/llms.txt",
          attrs: { target: "_blank" },
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            "../packages/protocol/src/index.ts",
            "../packages/codecs/src/index.ts",
            "../packages/core/src/index.ts",
            "../packages/client/src/index.ts",
          ],
          tsconfig: "./tsconfig.typedoc.json",

          output: "api",

          typeDoc: {
            skipErrorChecking: true,
            outputFileStrategy: "members",
            entryFileName: "index",
            excludeInternal: true,
            excludePrivate: true,
            excludeProtected: true,
            flattenOutputFiles: false,
          },
        }),
        starlightLlmsTxt({
          projectName: "Procwire",
          description:
            "Documentation for Procwire - high-performance binary IPC for Node.js (Protocol, Core, Client, Codecs).",
          details: `
Key Architectural Concepts:
- Procwire uses dual-channel architecture: Control Plane (JSON-RPC via stdio) + Data Plane (binary protocol via named pipes).
- Data Plane achieves ~2.5 GB/s throughput with zero JSON overhead.
- Four main packages: @procwire/protocol (wire format), @procwire/codecs (serialization), @procwire/core (parent-side), @procwire/client (child-side).
- Response types: none, ack, result, stream.
- All examples use TypeScript.
          `,

          minify: {
            whitespace: true,
            details: true,
            note: true,
            tip: true,
          },

          promote: ["guides/getting-started", "guides/core-concepts"],

          exclude: ["changelog", "team"],
        }),
      ],
    }),
  ],
  vite: {
    ssr: {
      noExternal: ["astro-mermaid", "mermaid"],
    },
    optimizeDeps: {
      include: ["mermaid"],
    },
  },
});
