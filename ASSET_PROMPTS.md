# คู่มือภาพ (UNO คอแตก — ธีมสมุดจดสีเทียน)

ภาพตัวละครตอนนี้ทำจาก **ภาพที่คุณวาด** (`art_src/`) + ท่าชั่วคราวที่สคริปต์ต่อเติมให้ (`tools/gen_poses.py`)
วาดท่าจริงเสร็จเมื่อไหร่ → **ตั้งชื่อเดิม ขนาดเดิม วางทับ** ใน `public/characters/<id>/` แล้วอัปโหลดใหม่ ไม่ต้องแก้โค้ด

## สไตล์ (ใส่ท้ายทุก prompt เวลาให้ ChatGPT ช่วย)
```
Hand-drawn crayon / colored-pencil illustration with visible grainy texture, soft pastel colors, no hard black outlines
(soft brown or color-matched edges only), simple cute face: big oval eyes with white highlight, tiny mouth, pink blush.
Cozy sticker / scrapbook look. Transparent background PNG, single character centered with ~8% margin, no text, no watermark.
Keep the exact same character design, proportions and colors as the attached reference image.
```
ภาพอ้างอิงสไตล์: ภาพที่ส่งมา (แมวหมวกแอปเปิ้ล, แอปเปิ้ล, นก, หมีชูครีม, หมาเหลือง, พิซซ่า)
เกมใส่ **ขอบขาวแบบสติกเกอร์ไดคัท + เงา** ให้เอง ไม่ต้องวาดขอบขาวมา (ถ้ารันสคริปต์) — ถ้าวางทับตรงใน public ให้ใส่ขอบขาวมาด้วยเพื่อให้เข้าชุด

## พาเลตสี (จากภาพ color ที่วงไว้)
| ใช้ทำ | สี |
|---|---|
| กระดาษ / เส้นตาราง | `#FBF8F1` / `#D9ECEE` |
| ตัวหนังสือ / กรอบไพ่ | `#3A2E39` / `#2E2433` |
| สีหลักพาสเทล | ฟ้า `#A1E6EF` · เหลือง `#F5E87A` · ชมพู `#E87D9D` · เขียวมะนาว `#DFF671` |
| สีเน้น (ตาคนเล่น, ปุ่มเด่น) | `#1BBDC7` · `#BA479C` · `#FFD502` |
| สีไพ่ UNO (เข้ม / พื้นอ่อน) | แดง `#F07C7C`/`#FDE0DC` · เหลือง `#F3CF3E`/`#FFF4C2` · เขียว `#6CC57A`/`#DDF5D9` · ฟ้า `#62B2E6`/`#DCEFFB` |

## ไฟล์ต่อตัวละคร `public/characters/<id>/`
| ไฟล์ | ขนาด | ใช้ตรงไหน | ท่า |
|---|---|---|---|
| `idle.png` | 1024×1024 โปร่งใส | กรอบรูปผู้เล่น, ล็อบบี้, สติกเกอร์ | ท่าปกติ (ภาพที่ส่งมา) |
| `shout.png` | 1024×1024 โปร่งใส | ฉากตัวละครโผล่ตอนลงไพ่พิเศษ / UNO | ลงไพ่แรงๆ ตะโกน ตื่นเต้น |
| `win.png` | 1024×1024 โปร่งใส | ตอนชนะ | ดีใจ ตาปิดยิ้ม ชูแขน/กระโดด |
| `sad.png` | 1024×1024 โปร่งใส | ตอนแพ้ | ร้องไห้ เหี่ยว |
| `card_art.png` | 512×512 โปร่งใส | ภาพกลางหน้าไพ่ทุกใบของผู้เล่นคนนี้ | ท่าโปรด หันหน้าตรง |
| `card_back.png` | 300×450 | หลังไพ่ | กรอบเข้ม `#2E2433` มุมโค้ง + ช่องในสีอ่อนของตัวละคร + ตัวละครตรงกลาง |
| `bg.png` | 800×800 | พื้นในกรอบรูปผู้เล่น | ลายกระดาษ/จุด/เส้นสีอ่อนของตัวละคร ไม่มีตัวละคร |
| `emblem.png` | 128×128 โปร่งใส | ไอคอนเว็บ | หน้าตัวละครในวงกลม |

## ตัวละคร (ชื่อและนิสัยตั้งไว้ก่อน แก้ได้ใน `character.json`)
| id | ภาพต้นฉบับ | ชื่อ | นิสัย |
|---|---|---|---|
| `applecat` | Apple_cat | เหมียวแอป | ขี้อาย พูดน้อย แต่แอบร้าย |
| `apple` | Apple_face | แอปปี้ | ร่าเริง มองโลกแง่ดี |
| `bird` | Bird | นกนวล | หน้านิ่ง กวน พูดสั้น |
| `choux` | Choux_Cream | ชูหมี | ขี้อ้อน กินเก่ง ใจดี |
| `dog` | Dog | ข้าวโพด | พลังล้น ตื่นเต้นทุกอย่าง |
| `pizza` | Pizza | พิซซี่ | มั่นใจ ขี้โม้ ชอบเหน็บ |

### Prompt ตัวอย่าง
```
Using the attached drawing as the exact character reference, draw "พิซซี่" (a cute pizza-slice character) in a WIN pose:
eyes closed happily (^ ^), big open smile, tilted and bouncing, small sparkles around. [วางสไตล์ด้านบน] 1024x1024 transparent PNG.
```

## ไพ่ (สร้างด้วยโค้ด ไม่ต้องวาด)
กรอบเข้ม · มุมบนซ้าย/ล่างขวาเป็นแถบเลขใหญ่สีตามไพ่ · ช่องกลางพื้นสีอ่อน + `card_art.png` ของเจ้าของไพ่ · ไพ่พิเศษมีป้ายชื่อด้านล่าง (ข้าม, กลับทิศ, จั่ว +2, เปลี่ยนสี, จั่ว +4)

## เพิ่มตัวละครใหม่
1. วางภาพท่าปกติ (พื้นโปร่ง) ที่ `art_src/<id>.png` แล้วเพิ่มสีใน `CH` ของ `tools/gen_poses.py` → `python3 tools/gen_poses.py`
   (หรือคัดลอก `public/characters/_template` แล้ววางภาพครบชุดเอง)
2. สร้าง `public/characters/<id>/character.json` (ดูตัวอย่างใน `_template`)
3. `node tools/build-manifest.mjs` → อัปโหลดโฟลเดอร์ `public` ขึ้น Netlify
