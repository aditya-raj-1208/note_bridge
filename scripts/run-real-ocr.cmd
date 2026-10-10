@echo off
rem Starts the production server (reads GEMINI_API_KEY from .env.local), waits, then runs the real handwritten OCR test.
rem Usage: scripts\run-real-ocr.cmd [lecture.pdf] [textbook.pdf]
set LECTURE=%~1
if "%LECTURE%"=="" set LECTURE=samples/fluid.pdf
set TEXTBOOK=%~2
if "%TEXTBOOK%"=="" set TEXTBOOK=samples/introduction-to-fluid-mechanics-and-fluid-machines-3nbsped-0071329196-9780071329194_compress.pdf
call npm run build > %TEMP%\nb-build-real.log 2>&1
start "notebridge-server" /b cmd /c "node node_modules/next/dist/bin/next start -p 3000 > %TEMP%\nb-server-real.log 2>&1"
timeout /t 8 /nobreak > nul
node scripts/ocr-test.mjs --real %LECTURE% %TEXTBOOK%
