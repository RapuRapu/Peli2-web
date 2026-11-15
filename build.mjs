import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  write: false,
});

const bundle = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = readFileSync('template.html', 'utf8').replace('/*BUNDLE*/', () => bundle);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
