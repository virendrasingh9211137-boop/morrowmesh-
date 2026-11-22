@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then try again.
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "$project='%~dp0'; $url='http://localhost:4173'; $ready=$false; try { $page=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($page.Content -match '<title>Morrowmesh</title>') { $ready=$true } } catch {}; if (-not $ready) { Start-Process -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory $project -WindowStyle Hidden; for ($i=0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; try { $page=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($page.Content -match '<title>Morrowmesh</title>') { $ready=$true; break } } catch {} } }; if (-not $ready) { Write-Error 'Morrowmesh did not start. Check that port 4173 is free and Node.js is installed.'; exit 1 }; Start-Process $url"
if errorlevel 1 pause
