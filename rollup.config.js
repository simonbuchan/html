import { terser } from 'rollup-plugin-terser';

export default {
  input: 'lib-esm/html.js',
  output: [
    {
      file: 'dist/html.bundled.mjs',
      format: 'esm',
    },
    {
      file: 'dist/html.bundled.js',
      format: 'cjs',
    },
  ],
  plugins: [
    terser({
      warnings: true,
      mangle: {
        module: true,
      },
    }),
  ],
};
