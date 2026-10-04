import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Framework AIOX e tooling de IDEs (não fazem parte da aplicação):
    ".aiox-core/**",
    ".aiox/**",
    ".agent/**",
    ".antigravity/**",
    ".claude/**",
    ".codex/**",
    ".cursor/**",
    ".gemini/**",
    ".github/**",
    ".grok/**",
    ".kimi/**",
  ]),
]);

export default eslintConfig;
