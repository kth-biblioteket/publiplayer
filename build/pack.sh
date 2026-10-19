#!/bin/sh
# Packar klienten som dist/PubLiPlayer.wgt (zip) och skriver dist/sssp_config.xml med version och storlek i byte.
# PUBLICOM_URL=https://värd/publicomtools sh build/pack.sh skriver in adressen som standard för inskrivningen i paketet
# (en installerad .wgt har ingen värd att utgå från, så utan den föreslås apps.lib.kth.se).
# SIGN_PROFILE=<certifikatprofil> sh build/pack.sh signerar paketet med Tizen-kommandoraden (docs/signering.md).
# OBS: utan SIGN_PROFILE är .wgt:n osignerad. Om skärmen kräver signering (Tizen Studio-certifikat) signeras den separat; se README.
set -eu

cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*<widget [^>]*version="\([^"]*\)".*/\1/p' config.xml)
[ -n "$VERSION" ] || { echo "Hittar ingen version i config.xml" >&2; exit 1; }

rm -rf dist
mkdir -p dist/stage
cp -R config.xml icon.png index.html css js dist/stage/

if [ -n "${PUBLICOM_URL:-}" ]; then
  case "$PUBLICOM_URL" in
    https://*|http://localhost*|http://127.0.0.1*) ;;
    *) echo "PUBLICOM_URL måste börja med https://" >&2; exit 1 ;;
  esac
  cat > dist/stage/js/env.js <<EOF
'use strict';
window.PP_DEFAULT_URL = '$PUBLICOM_URL';
EOF
fi

if [ -n "${SIGN_PROFILE:-}" ]; then
  # Signerat paket med Tizen-kommandoraden (kräver Tizen Studio och en certifikatprofil, se docs/signering.md). Oprovat.
  command -v tizen >/dev/null || { echo "tizen hittas inte i PATH (Tizen Studio: tools/ide/bin)" >&2; exit 1; }
  tizen package -t wgt -s "$SIGN_PROFILE" -o dist/signed -- dist/stage
  mv dist/signed/PubLiPlayer.wgt dist/PubLiPlayer.wgt
  rm -rf dist/signed
else
  (cd dist/stage && zip -q -r ../PubLiPlayer.wgt config.xml icon.png index.html css js)
fi
rm -rf dist/stage
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
