// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import esbuild from 'esbuild';
import fs from 'fs';

const isWatch = process.argv.includes('--watch');

const entryPoints = [
  { in: 'src/demo.tsx', out: 'demo' },
  { in: 'src/flow-matching.tsx', out: 'flow-matching' }
];

const config = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  jsxDev: isWatch,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"'
  },
  external: [
    '@tensorflow/tfjs',
    'file-saver',
    'jszip',
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-dev-runtime',
    'react/jsx-runtime'
  ],
  loader: {
    '.glsl': 'text',
    '.vert': 'text',
    '.frag': 'text',
  },
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('⚡ Watching for changes...');
} else {
  esbuild.build(config).then(() => {
    console.log('');
    for (const entry of entryPoints) {
      const path = `dist/${entry.out}.js`;
      const stats = fs.statSync(path);
      const sizeKb = (stats.size / 1024).toFixed(1);
      console.log(`  ${entry.out}.js  ${sizeKb}kb`);
    }
    console.log('\n\u26a1 Done');
  }).catch(() => process.exit(1));
}
