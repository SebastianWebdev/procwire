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
            "../packages/transport/src/index.ts",
            "../packages/codec-msgpack/src/index.ts",
            "../packages/codec-protobuf/src/index.ts",
            "../packages/codec-arrow/src/index.ts",
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
            "Documentation for Procwire library (Transport, Codecs: MsgPack, Protobuf, Arrow).",
          details: `
Key Architectural Concepts:
- Procwire focuses on type-safe communication.
- It supports multiple codecs (MsgPack, Protobuf, Arrow).
- Prefer using the defined types from 'api' section over raw objects.
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
