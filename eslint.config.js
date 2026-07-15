import { defineConfig, globalIgnores } from "eslint/config"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"
import globals from "globals"

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: [
      "api/**/*.js",
      "firebase/**/*.js",
      "pages/api/**/*.js",
      "scripts/**/*.js",
      "server/**/*.js",
      "shared/**/*.js",
      "*.config.{js,mjs,cjs}",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Vendored presentation components ported verbatim from the reference
    // design (motion-primitives library, reactbits Dither/DecryptedText, and
    // the R3F lanyard subsystem). Kept byte-identical to the reference, so the
    // opinionated React-19 hook/immutability rules and vendored `any` usage are
    // exempted here rather than editing third-party code.
    files: [
      "components/Dither.tsx",
      "components/DecryptedText.tsx",
      "components/motion-primitives/**/*.tsx",
      "components/lanyard-with-controls.tsx",
      "components/card-template.tsx",
      "components/ui/lanyard.tsx",
      "types/**/*.d.ts",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "out/**",
    "next-env.d.ts",
    "final frontend/**",
  ]),
])
