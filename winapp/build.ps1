# Савелий для Windows — build.ps1
# Собирает Savely.exe одним файлом. Запуск из папки winapp:
#   powershell -ExecutionPolicy Bypass -File build.ps1
# Требования: .NET 8 SDK (https://dot.net/download) и интернет на время
# сборки (NuGet тянет пакет WebView2). Результат: bin\Savely.exe

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "Нет dotnet. Поставь .NET 8 SDK: https://dot.net/download"
    exit 1
}

dotnet publish -c Release -r win-x64 --self-contained `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -o bin

$exe = Join-Path $PSScriptRoot "bin\Savely.exe"
if (Test-Path $exe) {
    $mb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "Готово: $exe ($mb МБ)"
    Write-Host "WebView2 Runtime уже стоит в Windows 10/11 — ничего доустанавливать не нужно."
}
