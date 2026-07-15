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
  globalIgnores([
    ".next/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "out/**",
    "next-env.d.ts",
  ]),
])
