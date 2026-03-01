// postcss.config.js
// NOTE: This repo uses `"type": "module"` in package.json, so this config must be ESM.
// If you prefer CommonJS, rename this file to `postcss.config.cjs` and use `module.exports = ...`.

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
