// สแกน public/characters → เขียน manifest.json + เติมรายชื่อไฟล์เสียงใน character.json
// รัน: node tools/build-manifest.mjs  (ทุกครั้งที่เพิ่มตัวละครหรือไฟล์เสียง)
import fs from 'fs'; import path from 'path';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public', 'characters');
const ids = [];
for (const id of fs.readdirSync(ROOT).sort()) {
  const dir = path.join(ROOT, id);
  if (id.startsWith('_') || id.startsWith('.') || !fs.statSync(dir).isDirectory()) continue;
  const f = path.join(dir, 'character.json'); if (!fs.existsSync(f)) continue;
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (c.enabled === false) continue;
  const voice = {}; const vd = path.join(dir, 'voice');
  if (fs.existsSync(vd)) for (const v of fs.readdirSync(vd).sort()) { const m = v.match(/^([a-z0-9]+)_\d+\.(mp3|ogg|wav|m4a)$/i); if (m) (voice[m[1].toLowerCase()] ||= []).push(v); }
  c.voice = voice; fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n');
  ids.push(id);
}
const order = ['applecat', 'apple', 'bird', 'choux', 'dog', 'pizza'];
ids.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify({ characters: ids }, null, 2) + '\n');
console.log('characters:', ids.join(', '));
