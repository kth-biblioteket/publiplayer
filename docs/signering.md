# Signera PubLiPlayer för en Samsung-skärm (developer mode)

Skärmens *Install Web App* (URL Launcher) hämtar `sssp_config.xml` och `PubLiPlayer.wgt` från en mapp, men installationen avvisas ("Unable to install") om paketet är osignerat. Den här anvisningen gör ett paket som går att installera på **en bestämd skärm**.

> **Läs först:** stegen bygger på Samsungs och Tizens dokumentation och forumsvar, inte på ett prov på just din skärm. Menynamn skiljer sig mellan modeller och firmware. Det som är oprovat är markerat med (?).

## Vad det blir
- Ett **Samsung-certifikat** (author + distributör) med skärmens **DUID**. Paketet går bara att installera på skärmar vars DUID ligger i certifikatet (högst 50 per certifikat (?)). Ny skärm eller ersatt skärm = nytt certifikat. En firmware-uppdatering kan också kräva nytt distributörscertifikat.
- Använd **Samsung**-typen, inte Tizen-typen. Ett Tizen-distributörscertifikat nekas på en Samsung-skärm.
- Bara den offentliga nivån behövs; PubLiPlayer använder bara `internet`-behörigheten.
- För många skärmar är det här en dålig väg. Samsungs partnerväg (omsignering av B2B-appar via Samsung) verkar kräva en relation med Samsung och är inte utredd.

## 1. Installera Tizen Studio (på Macen)
1. Hämta **Tizen Studio** från developer.tizen.org och installera. Kör den med Java-versionen installationen ber om.
2. Öppna **Package Manager** (Tools → Package Manager) och installera under *Extension SDK* tillägget **Samsung Certificate Extension** (och gärna *TV Extensions*).
3. Skapa ett **Samsung-konto** på developer.samsung.com om du inte har ett. Inloggningen görs i Certificate Manager och kan bara göras av dig.

## 2. Developer mode på skärmen
1. Gå till **URL Launcher Settings** på skärmen (på signageskärmar finns developer-inställningen ofta där, (?)). Alternativt: Apps → skriv `12345` med fjärrkontrollen (så gör man på Samsungs TV).
2. Slå på **Developer mode** och välj **Remote** med **Macens IP-adress**. Skärmen och Macen ska vara i samma nät.
   - Gotcha: en del skärmar vill ha IP-adressen **baklänges** (192.168.1.2 skrivs 2.1.168.192). Prova den andra om det inte går att ansluta.
3. Starta om skärmen helt (strömbrytaren; är *Instant On* påslaget behövs en fullständig avstängning). Developer mode slås av vid vissa omstarter och måste då göras om.
4. På Macen: `~/tizen-studio/tools/sdb connect <skärmens IP>`, sedan `sdb devices`. Eller Tizen Studio → Tools → **Device Manager** → *Remote Device Manager* → lägg till skärmen.

## 3. Skärmens DUID
- Skärmen: Menu → Support → Contact Samsung → **Unique Device ID**. Skriv av den noga.
- Eller i Tizen Studio: när skärmen är ansluten kan Certificate Manager fylla i DUID från enheten i listan (klicka **+** bredvid den).

## 4. Skapa certifikatet (Tools → Certificate Manager)
1. Avbryt dialogen *Migration for Certificate Profile* om den kommer.
2. **+** → profiltyp **Samsung** → **TV** → ge profilen ett namn, t ex `publiplayer`.
3. **Author certificate**: skapa ny. Fyll i uppgifterna, logga in med ditt Samsung-konto och välj en säkerhetskopia av filen.
4. **Distributor certificate**: skapa ny, välj privilege level **Public**, lägg in skärmens **DUID** (skriv in den eller **+** vid den anslutna enheten).
5. **Finish.** Profilen blir den aktiva.
6. **Säkerhetskopiera** author-filen (`author.p12`) och lösenorden **utanför repot**. Uppdateringar måste signeras med samma author-certifikat som originalet. Lägg aldrig certifikat eller lösenord i git (`*.p12` och `*.pwd` ligger i `.gitignore`).

## 5. Signera paketet
**Med Tizen Studio:** File → Import → *Tizen → Tizen Project* → välj mappen `dist/stage` efter ett bygge utan signering, eller repots rot. Högerklicka projektet → **Build Signed Package**. Då skapas `PubLiPlayer.wgt`.

**Med kommandoraden (oprovat, (?)):**
```
PUBLICOM_URL=https://apps-ref.lib.kth.se/publicomtools SIGN_PROFILE=publiplayer sh build/pack.sh
```
`pack.sh` kallar då `tizen package -t wgt -s publiplayer` (kräver att `~/tizen-studio/tools/ide/bin` ligger i `PATH`). Skriptet räknar sedan om storleken i `dist/sssp_config.xml` för den signerade filen.

Kontrollera att `<size>` i `sssp_config.xml` är exakt filens storlek i byte (`wc -c dist/PubLiPlayer.wgt`) och att `<widgetname>` är `PubLiPlayer`.

## 6. Lägg upp och installera
1. Be PubLiComTools servera `dist/PubLiPlayer.wgt` och `dist/sssp_config.xml` i `https://apps-ref.lib.kth.se/publicomtools/player-install/` (de ersätter filerna där).
2. På skärmen: URL Launcher → *Install Web App* → `https://apps-ref.lib.kth.se/publicomtools/player-install` (utan filnamn) → OK.
3. Lyckas det visas inskrivningsvyn. Skriv in koden från admin (adressen är inbakad i paketet).
4. Ett alternativ utan mapp: installera direkt med Tizen Studio (*Run As → Tizen Web Application*) eller `tizen install -n PubLiPlayer.wgt -t <enhet>`.

## Felsökning
| Symptom | Trolig orsak |
|---|---|
| "Unable to connect to the server" | Adressen är inte en mapp med `sssp_config.xml`, eller skärmen når inte servern |
| "Unable to download" | Mappen eller filnamnet är fel, eller storleken stämmer inte |
| "Unable to install" | Signatur saknas eller gäller inte skärmen (fel DUID, fel certifikattyp, tidigare firmware) |
| Går inte att ansluta i Device Manager | Fel IP (prova baklänges), olika nät, developer mode avslagen efter omstart |
| Installerar men sidan blir vit | Starta felsökningsläget (`index.html?debug=1` visas inte i en installerad app; använd Remote Web Inspector via Device Manager) |

## Källor
- Samsung: *Creating certificates* (developer.samsung.com/tv/develop/getting-started/setting-up-sdk/creating-certificates)
- Samsung Developer Forum: *Install Tizen .wgt using URL Launcher*, *Wgt Distribution – Tizen 7 Cert Problem*, *New certificates needed?*
- Tizen: *Application Signing and Certificates* (docs.tizen.org/application/web/tutorials/sign-certificate)
- signageOS: debugguide för Samsung Tizen (developer mode via URL Launcher Settings)
