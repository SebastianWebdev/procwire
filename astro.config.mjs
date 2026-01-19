// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc from "starlight-typedoc";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/withastro/starlight" }],
      sidebar: [
        {
          label: "Guides",
          items: [{ label: "Example Guide", slug: "guides/example" }],
        },
        // ZMIANA 1: Bezpieczna generacja menu
        // Mówimy Astro: "zbuduj menu z tego, co znajdziesz w folderze api"
        // To zapobiega błędowi "undefined reading hidden"
        {
          label: "API Reference",
          autogenerate: { directory: "api" },
        },
      ],
      plugins: [
        // ZMIANA 2: Konfiguracja TypeDoc
        starlightTypeDoc({
          entryPoints: [
            "../transport/src/index.ts",
            "../codec-msgpack/src/index.ts",
            "../codec-protobuf/src/index.ts",
            "../codec-arrow/src/index.ts",
          ],
          // Kluczowe: wskazujemy nasz "luźny" config, który ignoruje błędy bibliotek
          tsconfig: "./tsconfig.typedoc.json",
          // Musi pasować do nazwy folderu w sidebarze (powyżej)
          output: "api",
          typeDoc: {
            excludeInternal: true,
            excludePrivate: true,
            excludeProtected: true,
            // Kluczowe: To naprawia błąd "Buffer vs Uint8Array"
            // Mówimy generatorowi: "rób swoje, nawet jak TypeScript marudzi"
            skipErrorChecking: true,
          },
        }),
      ],
    }),
  ],
});
