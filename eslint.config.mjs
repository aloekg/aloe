import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The whole of jsx-a11y, not the handful of rules core-web-vitals carries: label-has-associated-
  // control and click-events-have-key-events are what would have caught ACCESSIBILITY.md §4 and
  // §13 before a reader did. The storefront only — the admin is out of scope there by decision, and
  // linting it would demand fixing exactly what was decided not to fix. A rule that misfires on a
  // deliberate pattern (a dialog backdrop, a combobox option) is disabled on that line with the
  // reason beside it, never here.
  //
  // Rules only: eslint-config-next already registers the plugin under this name, and a config that
  // brings its own `plugins` entry is refused as a redefinition.
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["app/admin/**"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
