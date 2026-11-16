import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const TARGETS = {
  crab: { entry: 'src/crab/main.js', template: 'template-crab.html', output: 'dist/index.html' },
  classic: { entry: 'src/main.js', template: 'template.html', output: 'dist/classic.html' },
};
const target = TARGETS[process.argv[2] || 'crab'];

const result = await build({
  entryPoints: [target.entry],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  write: false,
});

const bundle = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = readFileSync(target.template, 'utf8').replace('/*BUNDLE*/', () => bundle);
mkdirSync('dist', { recursive: true });
writeFileSync(target.output, html);
console.log(`${target.output} ${(html.length / 1024).toFixed(0)} KB`);
