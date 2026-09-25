import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Rules only: eslint-config-next already registers the plugin, and a second `plugins` entry is refused.
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["app/admin/**"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
