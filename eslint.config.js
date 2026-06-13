import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "examples/**",
      "**/.astro/**",
      // Non-published packages - exclude from CI lint
      "astro-docs/**",
      "tests/**",
      // The dashboard IS linted (see the relaxed block below), but never its
      // built client bundle.
      "dashboard/client/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // The dashboard is a workspace tool, not a published package, so it gets its
  // own relaxed config: allow inline `import()` type annotations (used in the
  // Fastify route handlers) rather than forcing top-level type imports.
  {
    files: ["dashboard/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: false },
      ],
    },
  },
  // The dashboard client runs in the browser; give it the browser globals.
  {
    files: ["dashboard/client/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  prettier,
);
