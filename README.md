# UNO คอแตก

เกม UNO ออนไลน์กับเพื่อน 2-6 คน (เพิ่มบอทได้) · ธีมสมุดจดสีเทียน · ตัวละคร 6 ตัวจากภาพวาด
**เล่นที่:** https://panupongpromklum.github.io/uno-kortaek/

## ระบบ
- หน้าเว็บ: GitHub Pages (ฟรี) — branch `gh-pages` = เนื้อหาในโฟลเดอร์ `public/`
- หลังบ้าน: Supabase โปรเจกต์ `uno-kortaek` (ล็อกอิน, ห้อง, เรียลไทม์, ตรรกะเกมกันโกงใน Edge Function `uno`)
- เพลง: lo-fi สร้างสดในเบราว์เซอร์ (ไม่มีลิขสิทธิ์) หรือวาง `public/audio/bgm.mp3` เอง
- เสียงพากย์: ไฟล์ mp3 จาก Edge TTS (ฟรี) ถ้ามี ไม่งั้นใช้เสียงไทยของเบราว์เซอร์ → ดู `VOICE_GUIDE.md`
- ทุกอย่างใช้ของฟรี/โอเพนซอร์ส: supabase-js, edge-tts, Google Fonts (Mali, Fredoka), Pillow

## กติกา & โหมด (เลือกในล็อบบี้)
UNO มาตรฐาน 108 ใบ · ตาละ 20 วิ · จั่วแล้วถ้าลงไม่ได้ข้ามให้อัตโนมัติ
กฎบ้าน: ซ้อน +2/+4 · ตบแทรก · 7 สลับมือ / 0 ส่งมือวน
โหมดพิเศษ: **วุ่นวาย** (ทุก 6 ตา สุ่ม: ฝนไพ่ / พลิกทิศ / สาดสี / คนไพ่เยอะสุดทิ้งได้ 1 ใบ) · **สปีด** (ตาละ 8 วิ)
อื่นๆ: นามบัตร 8 แบบ · สติกเกอร์ 8 แบบ · หลุดแล้วกลับเข้าห้องได้ · โหมดฝึกออฟไลน์

## โครงสร้าง
```
public/            หน้าเกม (index.html, css/, js/, characters/, audio/)
  js/shared/       กติกา + บอท (ชุดเดียวกับเซิร์ฟเวอร์)
  characters/<id>/ ภาพ 8 ไฟล์ + character.json (ชื่อ นิสัย ประโยคพากย์ เสียง) + voice/
supabase/          Edge Function + SQL
art_src/           ภาพต้นฉบับที่วาด
tools/             make_voices.py (Edge TTS) · gen_poses.py · build-manifest.mjs · sim.mjs
make_voices.bat    ดับเบิลคลิกสร้างเสียงพากย์ทุกประโยค
ASSET_PROMPTS.md   คู่มือวาดภาพ/สี · VOICE_GUIDE.md บทพากย์ทั้งหมด
```
