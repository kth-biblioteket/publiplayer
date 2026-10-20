#!/bin/sh
# Packar klienten som dist/PubLiPlayer.wgt (zip) och skriver dist/sssp_config.xml med version och storlek i byte.
# PUBLICOM_URL=https://värd/publicomtools sh build/pack.sh skriver in adressen som standard för inskrivningen i paketet
# (en installerad .wgt har ingen värd att utgå från, så utan den föreslås apps.lib.kth.se).
# SIGN_PROFILE=<profil> sh build/pack.sh signerar med Tizens tz-verktyg och en certifikatprofil (provat). Alternativ: SIGN_CERT_DIR=<mapp med author.p12 och distributor.p12> med build/tizen_sign.py.
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

(cd dist/stage && zip -q -r ../unsigned.wgt config.xml icon.png index.html css js)
if [ -n "${SIGN_PROFILE:-}" ]; then
  # Signering med Tizens eget verktyg tz (följer med VS Code-tillägget) och en certifikatprofil, t ex SIGN_PROFILE=PLP.
  # TZ kan peka på ett annat tz. Provat: ger ett paket som installeras på en Samsung-skärm i developer mode.
  TZ=${TZ_TOOL:-$HOME/.tizen-extension-platform/server/sdktools/data/tools/tizen-core/tz}
  [ -x "$TZ" ] || { echo "Hittar inte tz ($TZ); sätt TZ_TOOL" >&2; exit 1; }
  "$TZ" pack -t wgt -s "$SIGN_PROFILE" -b dist/unsigned.wgt -o dist/PubLiPlayer.wgt
elif [ -n "${SIGN_CERT_DIR:-}" ]; then
  # Signering med build/tizen_sign.py (bara Python och openssl); frågar efter lösenorden. SIGN_DIST_DIR: annan distributor.p12.
  python3 -I build/tizen_sign.py sign dist/stage dist/PubLiPlayer.wgt "$SIGN_CERT_DIR" ${SIGN_DIST_DIR:+"$SIGN_DIST_DIR"}
else
  mv dist/unsigned.wgt dist/PubLiPlayer.wgt
fi
rm -f dist/unsigned.wgt
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
