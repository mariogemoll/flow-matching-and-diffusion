import esbuild from 'esbuild';
import fs from 'fs';

const isWatch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/demo.tsx'],
  bundle: true,
  outfile: 'dist/demo.js',
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
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime'
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
    const stats = fs.statSync('dist/demo.js');
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log(`\n  demo.js  ${sizeKb}kb\n⚡ Done`);
  }).catch(() => process.exit(1));
}
