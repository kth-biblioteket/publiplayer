# PubLiPlayer

Klienten för Samsung Tizen-skyltskärmar (Tizen 4.0 och nyare) som styrs från publicomtools, som Linux-kiosken (publicom) och Android-appen (publikiosk). Bara skylt: skärmen skrivs in med en engångskod, hämtar inställningar och schema, visar sidorna i spellistan och rapporterar status. Omstart och skärmdump finns inte (kräver Samsungs partnercertifikat).

## Vad den gör

- **Inskrivning:** adress till publicomtools + engångskod från admin (Lägg till dator → Tizen-skärmar → Skapa inskrivningskod). `POST /api/device/enroll` ger token. Tokens och senaste inställningar sparas i lokal lagring.
- **Inställningar:** hämtas vid start och sedan en gång per minut (`CONFIG_POLL_MS` i `js/main.js`); en ändrad spellista slår igenom av sig själv, utan reload eller omstart. En oförändrad version gör ingenting, och en ny version rapporteras direkt i en statusrapport. `GET /api/device/config?format=json&host=…` (`SIGN_SCHEDULE`, `SIGN_PAGES`, `SIGN_SECONDS`, `SIGN_JS`, `SIGN_RELOAD`, `COMPUTER_NAME`, `HEARTBEAT_INTERVAL`). Katalogen för admin ligger i `config/catalog.json`. Utan nät vid start används de senaste inställningarna.
- **Rotation:** två iframes med förladdning (10 s före bytet, byte först när nästa sida ritat klart), felsida utan knappar (ny laddning efter 30 s, 10 s vid nätfel, trasig sida lämnas efter 10 s om listan har fler), svart skärm vid `off` eller tom lista. Samma regler som `SignageScreen.java` och `signage-run.js`. **Film** (sidovagnens mediasidor med `<video>`) spelas i en egen `<video id="film">` och förladdas inte, eftersom skärmen bara har en filmavkodare; skärmen tonas ut och in vid byte från en film till en film. Alla andra byten (bild till bild, film till bild, bild till film) har en kort övertoning (0,3 s, `XFADE_MS` i `js/rotator.js`). Se [docs/film-till-film.md](docs/film-till-film.md).
- **Ensam sida (`SIGN_RELOAD`):** en lista med exakt en sida (även när datumfiltret lämnar en) laddas om var `SIGN_RELOAD` minut (standard 10, 0 = aldrig, 0–1440), mjukt: sidan laddas i den dolda ramen och byts in när den är klar. En ensam film spelas i `<video id="film">`, loopar och laddas inte om; bara filmadressen läses om, och har den ändrats startas den nya under en ton.
- **Schema:** `js/schedule.js` är en port av `SignSchedule.java` (dagar, klockslag, datum, perioder, `off`).
- **Felupptäckt:** sidan kontrolleras med `fetch` (HEAD) innan den visas. Sidovagnens bildsidor (`…/api/sign/s/<id>`) svarar med CORS: 503 = ingen bild finns (sidan hoppas över), 404 = okänt id. Andra sidor utan CORS prövas med `no-cors` (nätverksfel eller ej) och godkänns på `onload`.
- **Stående eller liggande:** klienten fyller skärmens verkliga storlek. Står skärmen stående eller upp och ned och skärmens egen bildvridning inte används, vrider `ORIENTATION` (0, 90, 180, 270 grader medurs) hela scenen (sidor, felsida och inskrivning) med CSS. Storleken på en "sida som bild" i admin anges som den ser ut efter vridningen (1080×1920 för en stående skärm). Provat i webbläsare för 90°; 180° och 270° och själva Tizen-skärmen är inte provade.
- **Status:** `POST /api/heartbeat` med `platform: "tizen"` var `HEARTBEAT_INTERVAL` minut. Svaret `reload` hämtar inställningarna igen.

`SIGN_RESOURCES` finns inte i katalogen: en iframe kan inte begränsa vilka adresser sidans skript hämtar från.

## Körs som

- **Hostad sida:** `index.html` med `css/` och `js/` på en https-adress; skärmens URL Launcher pekar på den. Fungerar utan paket.
- **Ett paket per server:** adressen till publicomtools byggs in i paketet (`PUBLICOM_URL=https://apps.lib.kth.se/publicomtools` för produktion, `https://apps-ref.lib.kth.se/publicomtools` för ref) och är ifylld i inskrivningen, men dold: bara koden skrivs. Fältet visas om anslutningen misslyckas. En signerad `.wgt` går inte att ändra efteråt, så ref-paketet får inte läggas på produktion (eller tvärtom). Se [docs/ny-skarm.md](docs/ny-skarm.md).
- **Paket:** `sh build/pack.sh` ger `dist/PubLiPlayer.wgt` och `dist/sssp_config.xml` (version och storlek) för *Install Web App*. `.wgt` är osignerad; om skärmen kräver signering måste den signeras med Tizen Studio. Skärmen (Tizen 4.0, Install Web App) avvisade den osignerade `.wgt` med "Unable to install"; hur man signerar för en skärm står i [docs/signering.md](docs/signering.md).

**Versionen** (`VERSION` i `js/main.js` och `version` i `config.xml`) höjs vid varje ändring av spelaren. Den syns som Spelare i admin och visar vilken version skärmen faktiskt kör.

Koden är skriven för Chromium 56 (Tizen 4.0): vanliga skript, ingen bundler, inga moduler, ingen `async`/`await`.

Ny skärm: [docs/ny-skarm.md](docs/ny-skarm.md) (checklista, provad på en QH55R). Film på skärmen och IPv6: se [docs/video-och-ipv6.md](docs/video-och-ipv6.md). Signering och installation: [docs/signering.md](docs/signering.md). Felsökningsverktyg mot en körande app: `tools/` (webbinspektören via `sdb`).

## Prova

```
node tests/schedule.test.js        # schemalogiken
node tests/rotator.test.js         # rotationens tider (virtuell klocka): varje sida visas sin inställda tid
# tests/poll.html (via servern nedan, http://127.0.0.1:8000/tests/poll.html): omhämtningen av inställningar med en låtsasserver; titeln blir "poll OK"
python3 -m http.server 8000        # klienten i en vanlig webbläsare, http://127.0.0.1:8000
```

I webbläsaren går http bara mot localhost för adressen till publicomtools; annars krävs https.

## Filer

| Fil | Innehåll |
|---|---|
| `index.html`, `css/player.css` | två iframes, felsida, inskrivning |
| `js/schedule.js` | SIGN_PAGES och SIGN_SCHEDULE (ren logik, provas i Node) |
| `js/client.js`, `js/store.js` | protokollet mot publicomtools, lokal lagring |
| `js/rotator.js` | rotation, förladdning, felsida, felupptäckt |
| `js/ui.js`, `js/main.js` | vyer; start, inställningar och statusrapport |
| `config.xml`, `build/pack.sh` | Tizen-widget och paketering |
| `config/catalog.json` | nycklarna som admin visar för Tizen-skärmar |
