// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc from "starlight-typedoc";
import textPlugin from "astro-d2";
import mermaid from "astro-mermaid";

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
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            "../transport/src/index.ts",
            "../codec-msgpack/src/index.ts",
            "../codec-protobuf/src/index.ts",
            "../codec-arrow/src/index.ts",
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
