import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next ships flat configs directly from v15 on, so there is no
 * FlatCompat shim here.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "assets/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // The geometry and exporter code is deliberately explicit about types.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // react-three-fiber renders to a WebGL scene graph rather than the DOM.
    // Mutating the camera, a material's uniforms and a mesh's transform IS its
    // public API, and useFrame runs outside React's render cycle on purpose.
    // The compiler's purity rules model a DOM-rendering world and flag those
    // documented calls as defects. Scoped to the one file that talks to the
    // renderer, so every other component is still held to them.
    files: ["src/components/Scene.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default config;
