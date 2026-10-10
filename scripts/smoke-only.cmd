@echo off
rem Quick check: regenerate samples, start the production server (needs a prior npm run build), run the smoke test.
node scripts/make-sample-pdfs.mjs
start "notebridge-smoke" /b cmd /c "node node_modules/next/dist/bin/next start -p 3000 > %TEMP%\nb-smoke-server.log 2>&1"
timeout /t 8 /nobreak > nul
node scripts/smoke-test.mjs
echo SMOKE_EXIT=%ERRORLEVEL%
