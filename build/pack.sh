#!/bin/sh
# Packar klienten som dist/PubLiPlayer.wgt (zip) och skriver dist/sssp_config.xml med version och storlek i byte.
# OBS: .wgt:n är osignerad. Om skärmen kräver signering (Tizen Studio-certifikat) signeras den separat; se README.
set -eu

cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*<widget [^>]*version="\([^"]*\)".*/\1/p' config.xml)
[ -n "$VERSION" ] || { echo "Hittar ingen version i config.xml" >&2; exit 1; }

rm -rf dist
mkdir dist
zip -q -r dist/PubLiPlayer.wgt config.xml index.html css js
SIZE=$(wc -c < dist/PubLiPlayer.wgt | tr -d ' ')

cat > dist/sssp_config.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<widget>
  <ver>$VERSION</ver>
  <size>$SIZE</size>
  <widgetname>PubLiPlayer</widgetname>
</widget>
EOF

echo "dist/PubLiPlayer.wgt ($SIZE byte, version $VERSION) och dist/sssp_config.xml"
