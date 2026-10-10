@echo off
rem Full local verification without calling the real Gemini API: build, lint, smoke test, OCR pipeline tests.
rem Output: %TEMP%\nb-verify.log
call npm run build > %TEMP%\nb-verify-build.log 2>&1
echo BUILD_EXIT=%ERRORLEVEL%
call npx eslint src scripts > %TEMP%\nb-verify-lint.log 2>&1
echo LINT_EXIT=%ERRORLEVEL%
type %TEMP%\nb-verify-lint.log
start "notebridge-smoke" /b cmd /c "node node_modules/next/dist/bin/next start -p 3000 > %TEMP%\nb-verify-server.log 2>&1"
timeout /t 8 /nobreak > nul
node scripts/smoke-test.mjs
echo SMOKE_EXIT=%ERRORLEVEL%
node scripts/ocr-test.mjs
echo OCR_EXIT=%ERRORLEVEL%
