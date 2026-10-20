# Lägga till en ny Samsung-skärm (checklista, provad på en QH55R, Tizen 4.0)

Resultat 20 oktober 2026: ett paket signerat med ett Samsung-utvecklarcertifikat (bundet till skärmens enhets-ID) går att installera via *Install Web App* **utan developer mode**, startar själv efter omstart och rullar. Developer mode behövs bara för att felsöka med `sdb`.

## Före allt
- Skärmen har *URL Launcher* med fältet *Install Web App* (en mapp-adress, inte en vanlig webbsida). *Play via* ska vara URL Launcher.
- Skärmens **enhets-ID (DUID)**: Menu → Support → Contact Samsung → Unique Device ID (13 tecken), eller `sdb -s <IP>:26101 shell 0 getduid` i developer mode.
- Skärmen måste kunna nå servern över både IPv4 och IPv6 (se [video-och-ipv6.md](video-och-ipv6.md)): en server med IPv6-adress i DNS som inte svarar på 443 över IPv6 gör att filmer står still.

## 1. Certifikat (per skärm, gäller ett år)
1. Skapa en Samsung-profil i certifikatprogrammet (VS Code-tillägget *Tizen*, Certificate Manager) och lägg in skärmens DUID i distributörscertifikatet.
2. **Kontrollera att ID:t kom med** (importen av en DUID-fil gav två gånger ett certifikat utan ID):
   `openssl x509 -in ~/SamsungCertificate/<profil>/distributor.crt -noout -ext subjectAltName`
   Det ska stå `URN:tizen:deviceid=<skärmens DUID>`. Står det `No extensions in certificate` saknas ID:t.
3. Författar- och distributörscertifikatet hamnar i `~/SamsungCertificate/`. Säkerhetskopiera `*.p12` och lösenorden utanför repot.

## 2. Paketet
- `config.xml`: `widget id` ska vara **samma** som `tizen:application id` (`PubLiPlay0.PubLiPlayer`), annars avvisas paketet med `install failed[118012]`.
- Bygg och signera: `PUBLICOM_URL=https://<server>/publicomtools SIGN_PROFILE=<profil> sh build/pack.sh` (Tizens `tz pack` från VS Code-tillägget). Filen **ska heta `PubLiPlayer.wgt`** (namnet blir appens id på skärmen). `PUBLICOM_URL` bakar in standardadressen till publicomtools.
- Lägg `dist/PubLiPlayer.wgt` och `dist/sssp_config.xml` (storleken i byte ska stämma) direkt i en mapp på en https-adress utan omdirigering och utan inloggning (hos oss `…/publicomtools/player-install/`).

## 3. Installera på skärmen
1. Provat en gång per skärm med `sdb` (developer mode): `device-profile.xml` från certifikatmappen lades i skärmens `/home/owner/share/tmp/sdk_tools/` (kallas *permit to install*). **Oklart om det behövs för att *Install Web App* ska fungera** på en ny skärm; vi gjorde det före alla installationer, och filen låg kvar. Prova utan, och gör det i så fall om installationen avvisas.
2. På skärmen: URL Launcher → *Install Web App* → mappadressen (utan filnamn) → OK. Skärmen visar "Downloading…", "Installing…" och startar appen.
3. Skriv in skärmen: skapa en inskrivningskod i admin (Lägg till dator → Tizen-skärmar) och skriv den med fjärrkontrollen. Adressen är redan ifylld.
4. Stäng gärna av developer mode och starta om skärmen helt: appen startar själv.

## Uppdatera en skärm
Lägg ett nytt signerat paket med högre versionsnummer i mappen (`config.xml` och `sssp_config.xml`) och kör *Install Web App* igen på skärmen. En ominstallation via `sdb` rensar appens data (inskrivningen); en uppgradering via *Install Web App* behöll den vad vi kunde se, men det är inte uttryckligen kontrollerat.

## Att veta
- **Certifikatet är bundet till skärmens DUID** (högst 50 per certifikat) och går ut efter ett år (det vi har: 19–20 oktober 2027). Ny eller ersatt skärm betyder nytt certifikat och omsignerat paket. Samsungs Enterprise-signatur (som SmartSign Players paket har) skulle slippa det; vi har inte provat att få en.
- **Ändrad spellista slår igenom inom en minut** (spelaren hämtar config var 60:e sekund). Visningstiden gäller exakt: den styr hur länge en film visas, en film som är längre klipps och en kortare slingrar (filmsidan har `loop`).
- **Tystikonen** som blinkar när skärmen står på mute är skärmens eget beteende (den blinkar även på startsidan). Sätt volymen till 0 i stället för mute.
- Felsökning av en körande app: [video-och-ipv6.md](video-och-ipv6.md) och `tools/`. Orsaker och blindgångar vi redan har utrett: [signering.md](signering.md).
