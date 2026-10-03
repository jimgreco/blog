import { FlatCompat } from "@eslint/eslintrc"
import { fileURLToPath } from "node:url"

const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL(".", import.meta.url)),
})

const config = [
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.cjs", "next.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]

export default config
