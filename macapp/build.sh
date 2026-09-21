#!/usr/bin/env bash
# Савелий для macOS — собирает Savely.app из Savely.swift системным swiftc.
# Xcode не нужен: хватает Command Line Tools (xcode-select --install).
# Запуск: cd macapp && bash build.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "Нет swiftc. Поставь Command Line Tools: xcode-select --install"
  exit 1
fi

APP="Savely.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "==> Компилирую"
swiftc -O -o "$APP/Contents/MacOS/Savely" Savely.swift \
  -framework Cocoa -framework WebKit

echo "==> Значок"
# icns из png сайта: iconutil хочет .iconset с файлами строгих имён.
ICONSET="icon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
SRC="../icon-512.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2))
  if [ "$d" -le 512 ]; then
    sips -z $d $d "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
  fi
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"
rm -rf "$ICONSET"

cp Info.plist "$APP/Contents/Info.plist"

echo ""
echo "Готово: $(pwd)/$APP"
echo "Открыть: open $APP   (в Dock можно перетащить)"
