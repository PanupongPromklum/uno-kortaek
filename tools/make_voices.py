"""สร้างไฟล์เสียงพากย์ภาษาไทยทุกประโยคด้วย Edge TTS (ฟรี ไม่ต้องสมัคร ใช้เสียง Microsoft Neural ภาษาไทย)
รัน:  python tools/make_voices.py          (สร้างเฉพาะไฟล์ที่ยังไม่มี)
      python tools/make_voices.py --force  (สร้างใหม่ทั้งหมด หลังแก้ประโยค)
ต้องการ: pip install edge-tts   และต่ออินเทอร์เน็ต
เสียง/ความเร็ว/ระดับเสียงของแต่ละตัว ตั้งใน character.json → "tts": {"edge", "edgeRate", "edgePitch"}
"""
import asyncio, json, os, sys
try:
    import edge_tts
except ImportError:
    sys.exit('ยังไม่ได้ติดตั้ง edge-tts → รัน: python -m pip install edge-tts')

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'characters')
FORCE = '--force' in sys.argv

async def main():
    ids = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))['characters']
    total = 0
    for cid in ids:
        f = os.path.join(ROOT, cid, 'character.json')
        c = json.load(open(f, encoding='utf-8'))
        t = c.get('tts', {})
        voice, rate, pitch = t.get('edge', 'th-TH-PremwadeeNeural'), t.get('edgeRate', '+0%'), t.get('edgePitch', '+0Hz')
        vdir = os.path.join(ROOT, cid, 'voice'); os.makedirs(vdir, exist_ok=True)
        vmap = {}
        for ev, lines in c.get('lines', {}).items():
            for i, text in enumerate(lines):
                name = f'{ev}_{i + 1}.mp3'; out = os.path.join(vdir, name)
                if FORCE or not os.path.exists(out):
                    for attempt in range(3):
                        try:
                            await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(out); break
                        except Exception as e:
                            print('  retry', name, e); await asyncio.sleep(2)
                    total += 1
                    print(f'{c["name"]:>10}  {name:<14} {text}')
                if os.path.exists(out): vmap.setdefault(ev, []).append(name)
        c['voice'] = vmap
        json.dump(c, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'\nเสร็จ สร้างใหม่ {total} ไฟล์  → ส่งโฟลเดอร์นี้ขึ้น GitHub (หรือบอก Claude ให้ push ให้)')

asyncio.run(main())
