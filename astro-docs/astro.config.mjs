// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc from "starlight-typedoc";
import textPlugin from "astro-d2"; // Import dla D2
import mermaid from "astro-mermaid"; // Import dla Mermaid

// https://astro.build/config
export default defineConfig({
  site: "https://procwire.dev",
  // ... sekcja site, base, integrations bez zmian ...
  integrations: [
    textPlugin({
      // Opcjonalnie: Motyw (np. 100, 101, 102...)
      theme: {
        dark: "200", // Ciemny motyw pasujący do Twojego CSS
        default: "100",
      },
      skipGeneration: false,
    }),

    // 2. Plugin Mermaid (Flowcharty)
    mermaid(),
    starlight({
      title: "Procwire Docs", // Lub Twoja nazwa
      // Ważne: Sidebar musi używać autogenerate
      sidebar: [
        { label: "Guides", autogenerate: { directory: "guides" } },
        {
          label: "API Reference",
          // To mówi Astro: "zbuduj drzewko z folderów, które wygeneruje TypeDoc"
          autogenerate: { directory: "api" },
        },
      ],
      plugins: [
        starlightTypeDoc({
          // Ścieżki do Twoich pakietów (z jedną kropką mniej, jak ustaliliśmy)
          entryPoints: [
            "../transport/src/index.ts",
            "../codec-msgpack/src/index.ts",
            "../codec-protobuf/src/index.ts",
            "../codec-arrow/src/index.ts",
          ],
          tsconfig: "./tsconfig.typedoc.json",

          // Folder docelowy
          output: "api",

          // --- TU JEST MAGIA ---
          typeDoc: {
            // 1. Ignoruj błędy typów (Buffer itd.)
            skipErrorChecking: true,

            // 2. STRATEGIA PLIKÓW: 'members'
            // To przywraca osobne pliki dla klas, interfejsów itd.
            // Agent zmienił to na 'modules', dlatego miałeś jedną długą stronę.
            outputFileStrategy: "members",

            // 3. NAZWA PLIKU WEJŚCIOWEGO: 'index'
            // Dzięki temu folder transport/ otwiera się jako transport/index.html
            // To naprawia błędy 404 i "brzydkie linki" typu /readme
            entryFileName: "index",

            // 4. CZYSTOŚĆ
            // Ukrywamy prywatne metody, żeby nie śmiecić w dokumentacji biznesowej
            excludeInternal: true,
            excludePrivate: true,
            excludeProtected: true,

            // 5. ZACHOWANIE STRUKTURY
            // Wymuszamy tworzenie folderów, żeby sidebar miał z czego zrobić drzewko
            flattenOutputFiles: false,
          },
        }),
      ],
    }),
  ],
  vite: {
    ssr: {
      // Zapobiega błędom "document is not defined" podczas budowania
      noExternal: ["astro-mermaid", "mermaid"],
    },
    optimizeDeps: {
      // Wymusza pre-bundling mermaida, żeby Vite się nie gubił
      include: ["mermaid"],
    },
  },
});
