import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const manifest=JSON.parse(await readFile(resolve(here,'manifest.json'),'utf8'));
for(const [path, expected] of Object.entries(manifest.sha256)) {
  const actual=createHash('sha256').update(await readFile(resolve(root,manifest.destination,path))).digest('hex');
  if(actual!==expected) throw Error('Upstream modified: '+path);
}
const original=await readFile(resolve(root,manifest.destination,'docs/claude-components-storybook.html'),'utf8');
const generated=await readFile(resolve(root,'public/claude-ui/index.html'),'utf8');
if(original.match(/<style>([\s\S]*?)<\/style>/)[1]!==generated.match(/<style>([\s\S]*?)<\/style>/)[1]) throw Error('Inline styles diverged');
if(/<script[^>]+src="https?:/.test(generated)) throw Error('External runtime dependency remains');
console.log(`Verified ${Object.keys(manifest.sha256).length} upstream files and local showcase adapter.`);
const chat=await readFile(resolve(root,'public/claude-chat/index.html'),'utf8');
if(/(?:src|href)="https?:/.test(chat)) throw Error('Chat requires external runtime asset');
for(const asset of ['chat.js','chat.css','LICENSE.txt','fonts/inter-latin-wght-normal.woff2','fonts/newsreader-latin-wght-normal.woff2','fonts/jetbrains-mono-latin-wght-normal.woff2','fonts/inter-LICENSE.txt','fonts/newsreader-LICENSE.txt','fonts/jetbrains-mono-LICENSE.txt']) {
  if(!(await readFile(resolve(root,'public/claude-chat',asset))).length) throw Error('Missing chat asset: '+asset);
}
const bundle=await readFile(resolve(root,'public/claude-chat/chat.js'),'utf8');
if(/@anthropic-ai\/|\/api\/code\//.test(bundle)) throw Error('Paused SDK path included in chat');
console.log('Verified Chat/Cowork assets, local font licenses and paused SDK boundary.');
const webManifest=JSON.parse(await readFile(resolve(root,'integrations/claude-web/manifest.json'),'utf8'));
for(const [path,expected] of Object.entries(webManifest.sha256)){
 const actual=createHash('sha256').update(await readFile(resolve(root,'integrations/claude-web',path))).digest('hex');
 if(actual!==expected)throw Error('Original web snapshot changed: '+path);
}
for(const name of ['cc27851ad-DDVos-BJ.woff2','c66fc489e-2VcCjn5t.woff2','spark.svg','voice.svg','incognito.svg'])await readFile(resolve(root,'public/claude-web-assets',name));
if(/Free plan|Upgrade your plan|\.ai\/upgrade|· Free/.test(bundle))throw Error('Removed plan promotion returned');
console.log('Verified restored web snapshot, original assets and removed plan promotion.');

if(/任务工作区|生成演示文档|任务简报\.md|梳理任务要求与输入材料|welcome\.html/.test(bundle))throw Error('Retired demo workflow returned');
console.log('Verified retired workflow is absent from the chat bundle.');
