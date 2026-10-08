import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  { ignores: [".next/**", ".next-test/**", "node_modules/**", "public/**", "lib/generated/**", "test-results/**", "playwright-report/**"] },
  ...nextCoreWebVitals,
];

export default eslintConfig;
