# Kill process on port 5000 and start the dev server
$port = 5000
$pid = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)
if ($pid) {
    Write-Host "Killing process on port $port (PID: $pid)..."
    Stop-Process -Id $pid -Force
    Start-Sleep -Seconds 1
} else {
    Write-Host "No process found on port $port."
}

Write-Host "Starting dev server..."
npm run dev
