@echo off
set PORT=%1
if "%PORT%"=="" set PORT=8080

echo.
echo ========================================================================================
echo                            Documentation Server Starting
echo ========================================================================================
echo   Open in browser: http://localhost:%PORT%/documentor_files/documentor_viewer.html
echo   Press Ctrl+C to stop
echo ========================================================================================
echo.

cd /d "%~dp0.."
python -m http.server %PORT% --bind 0.0.0.0
