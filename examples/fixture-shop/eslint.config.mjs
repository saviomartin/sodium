import { nextJsConfig } from "@repo/eslint-config/next-js";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    // Generated node scripts (sodium/verify.mjs) run under plain Node.
    files: ["**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
];
