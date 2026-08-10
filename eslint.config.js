import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".pi-subagents/**",
      "eslint.config.js",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "@typescript-eslint/only-throw-error": "error",
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // Vitest spies are intentionally referenced apart from their mock objects.
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
