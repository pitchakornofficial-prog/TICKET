import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';

const path = '.env.local';
let content;
try { content = await readFile(path, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; content = await readFile('.env.example', 'utf8'); }
if (!/^BETTER_AUTH_SECRET=.+$/m.test(content)) {
  content = content.replace(/^BETTER_AUTH_SECRET=.*\n?/gm, '');
  content += `\nBETTER_AUTH_SECRET=${randomBytes(32).toString('base64url')}\n`;
}
if (!/^BETTER_AUTH_URL=.+$/m.test(content)) content += '\nBETTER_AUTH_URL=http://127.0.0.1:3000\n';
await writeFile(path, content, { mode: 0o600 });
await chmod(path, 0o600);
console.log('Local auth configuration ready (existing secret retained)');
