import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const upstream = resolve(root, 'vendor/open-claude-ui');
const output = resolve(root, 'public/claude-ui');
const html = await readFile(resolve(upstream, 'docs/claude-components-storybook.html'), 'utf8');
const configScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
const jsx = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)?.[1];
if (!configScript || !jsx) throw Error('Upstream showcase format changed; review adapter.');
const sandbox = { tailwind: {} };
runInNewContext(configScript, sandbox, { timeout: 1000 });
const config = sandbox.tailwind.config;
config.content = [{ raw: html, extension: 'html' }];
await mkdir(output, {recursive:true});
const css = await postcss([tailwind(config)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', {from:undefined});
await writeFile(resolve(output, 'showcase.css'), css.css);
await build({
  stdin: {
    contents: `import React from ${JSON.stringify(resolve(upstream,'node_modules/react/index.js'))};\nimport ReactDOM from ${JSON.stringify(resolve(upstream,'node_modules/react-dom/index.js'))};\n` + jsx + `\nrequestAnimationFrame(() => { const id = location.hash.slice(1); if(id) document.getElementById(id)?.scrollIntoView(); });`,
    resolveDir: root, loader:'jsx', sourcefile:'upstream-showcase.jsx'
  },
  bundle:true, minify:true, format:'iife', platform:'browser',
  define:{'process.env.NODE_ENV':'"production"'},
  outfile:resolve(output,'showcase.js'),
  legalComments:'linked',
});
// Only dependency delivery changes; the upstream JSX, inline styles and content remain intact.
const local = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')
  .replace('</head>','<link rel="stylesheet" href="./showcase.css"></head>')
  .replace('</body>','<script src="./showcase.js"></script></body>');
await writeFile(resolve(output,'index.html'),local);
await copyFile(resolve(upstream,'LICENSE'),resolve(output,'LICENSE.txt'));
await copyFile(resolve(upstream,'docs/claude-components-storybook.html'),resolve(output,'upstream-original.html'));
console.log('Built unchanged upstream showcase with local React and Tailwind dependencies.');
await import('./build-chat.mjs');
