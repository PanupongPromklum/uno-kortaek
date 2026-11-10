@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === ติดตั้ง edge-tts (ครั้งแรกครั้งเดียว) ===
python -m pip install --upgrade edge-tts
echo === กำลังสร้างเสียงพากย์ทุกประโยค ===
python tools\make_voices.py %*
pause
