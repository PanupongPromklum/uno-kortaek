@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal
set "PY="
set "PYA="

rem --- find Python: py launcher, known install folders, or python on PATH ---
where py >nul 2>nul && set "PY=py" && set "PYA=-3"
if not defined PY for %%V in (313 312 311 310) do if not defined PY if exist "%LocalAppData%\Programs\Python\Python%%V\python.exe" set "PY=%LocalAppData%\Programs\Python\Python%%V\python.exe"
if not defined PY python -c "print(1)" >nul 2>nul && set "PY=python"

if not defined PY (
  echo === ไม่พบ Python - กำลังติดตั้งให้อัตโนมัติ ฟรีจาก python.org ผ่าน winget ===
  winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
  if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PY=%LocalAppData%\Programs\Python\Python312\python.exe"
)
if not defined PY (
  echo.
  echo ติดตั้ง Python อัตโนมัติไม่สำเร็จ
  echo ให้ดาวน์โหลดเองที่ https://www.python.org/downloads/ ตอนติดตั้งติ๊ก Add python.exe to PATH แล้วดับเบิลคลิกไฟล์นี้อีกครั้ง
  pause
  exit /b 1
)

echo === ใช้ Python: %PY% ===
echo === ติดตั้ง edge-tts ครั้งแรกครั้งเดียว ===
"%PY%" %PYA% -m pip install --user --upgrade edge-tts
echo === กำลังสร้างเสียงพากย์ทุกประโยค ใช้เวลา 3-5 นาที ===
"%PY%" %PYA% tools\make_voices.py %*
echo.
echo เสร็จแล้ว บอก Claude ได้เลยว่าสร้างเสียงเสร็จแล้ว
pause
