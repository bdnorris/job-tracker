import fs from 'node:fs';
import path from 'node:path';

const targetFile = path.resolve(
  process.cwd(),
  'node_modules/@netlify/edge-functions-dev/dist/node/main.js'
);

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  if (content.includes('"--allow-scripts",')) {
    content = content.replace('"--allow-scripts", ', '');
    content = content.replace('"--allow-scripts",', '');
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('✅ Patched @netlify/edge-functions-dev to fix Deno 2 incompatibility.');
  }
}
