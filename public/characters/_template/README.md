# เพิ่มตัวละครใหม่
1. คัดลอกโฟลเดอร์นี้เป็น `public/characters/<id>` (id ภาษาอังกฤษตัวเล็ก เช่น `donut`)
2. แก้ `character.json`: name, title (คำอธิบาย·นิสัย), color/light/accent, lines (ประโยคตอนตัวละครโผล่)
3. วางภาพทับ: idle, shout, win, sad (1024² โปร่งใส มีขอบขาวสติกเกอร์), card_art (512²), card_back (300×450), bg (800²), emblem (128²)
   ภาพในโฟลเดอร์นี้เป็นตัวอย่างจากแอปปี้ ให้เปลี่ยนทั้งหมด
4. เสียง (ไม่บังคับ): `voice/<event>_<เลข>.mp3` ดู VOICE_GUIDE.md
5. `node tools/build-manifest.mjs` แล้วอัปโหลด `public` ใหม่
