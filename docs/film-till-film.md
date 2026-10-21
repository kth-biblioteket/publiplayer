# Film på Samsung-skärmen: en filmavkodare, svart bild vid filmbyte

Hur spelaren hanterar film på en skärm med bara en filmavkodare, vad som mättes och vad som provats. Skrivet så att det går att läsa utan resten av historiken.

## Lösningen som används (0.1.18)

- **Alla filmer spelas i spelarens egen `<video id="film">`**, en enda, aldrig i ramar och aldrig två videor samtidigt. Filmsidor från sidovagnen (`/api/sign/m/<id>`) känns igen på att HTML:en har `<video src=...>`; spelaren hämtar filmens adress därifrån och spelar den själv. Ramarna töms medan en film spelar.
- **En film förladdas inte.** Den laddas först när den ska visas. (Bildsidor och andra sidor förladdas som förut, även medan en film spelar.)
- **Byte till en film:** skärmen **tonas ut till svart (0,4 s)**, filmen startas medan det är svart (första bilden ca 0,5 s efter), och skärmen tonas in. Film→film byter `src` på samma `<video>`. Film→bild: bilden förladdas i en ram, tar över, och filmen släpps efteråt. Utan tonen syns en svart ruta; med tonen ser det avsiktligt ut (provat av en människa på skärmen).
- Det som är kvar är alltså en kort mörk övergång (cirka en sekund från början av utonen) vid byte till en film, inte ett glapp.

## Det som gick fel innan (kort)

Filmsidor i ramar med förladdning gav: nästa film syntes genom filmens hål (13 s-filmen visades 3 s), den första fryste när den andra började, dubbla bilder och ett brusblock i nedre högra hörnet. Rotatorn visade dessutom sidor längre än inställt (schemakontrollen räknade om bytet från noll). Båda är rättade; `tests/rotator.test.js` kontrollerar det.

## Bakgrund till problemet

## Sammanfattning (ursprungliga problemet)

På Samsung-skärmen (QH55R, Tizen 4.0) blir det **0,5–1 s svart bild** när en film följer direkt på en film i spellistan. Bild→film och film→bild är rena. Orsaken är att skärmen bara har **en filmavkodare**: så fort en andra `<video>` skapas fryser den första (och fryst visar skärmen svart, inte en stillbild). Det går inte att starta nästa film i förväg.

Det som är löst (0.1.18): en film som följer på en film frös tidigare mitt i filmen eller lös igenom den andra, så den första visades bara ca 3 s. Nu spelar båda filmerna hela sin tid. Kvar är bara den korta svarta luckan vid själva bytet.

## Bakgrund

- **Skärm:** Samsung QH55R, Tizen 4.0 (Chromium 56), skyltläge. Appen är en installerad webbapp (`.wgt`, "Install Web App"), alltså sidan `file://`. Inget krav på partnercertifikat; paketet signeras med Samsungs utvecklarcertifikat.
- **Spelaren:** `js/rotator.js`. Två `<iframe>` (A och B) ligger över varandra; nästa sida laddas i den andra 10 s före bytet och byts in när den är klar. Se README.
- **Filmsidorna** kommer från publicomtools sidovagn (`/api/sign/m/<id>`, en HTML-sida med en `<video>`; själva filen på `/api/sign/f/<id>.mp4`). Sidan ägs av ett annat projekt (PubLiComTools) och kan ändras. Sidan lyssnar på `postMessage('pp-activate')` och startar då filmen om från 0.
- **Begränsningar för koden:** Chromium 56, vanliga skript, ingen bundler, ingen `async`/`await`.
- Skärmen spelar `<video>` på ett eget hårdvaruplan bakom webblagret. Webbsidan "punchar hål" (transparent) där videon ligger.

## Vad som är mätt (på skärmen, via webbinspektören)

1. **En andra `<video>` fryser den första direkt när den skapas**, även om den inte spelar: första filmens `currentTime` står still (t.ex. 2,9 s) från det ögonblicket. Gäller både i en `<iframe>` och direkt i toppsidan.
2. **Det som visas medan den första är fryst är svart** (iakttaget med ögat, inte en stillbild).
3. **En andra video som är förbuffrad** (`preload="auto"`, `readyState` 4 inom 0,5 s) och sedan startas med `play()` visar första bilden efter **ca 120 ms**.
4. **Tid från start till första bild:**
   - byta `src` på samma `<video>`: **ca 540 ms**
   - skapa en ny `<video>` med autoplay: **ca 880 ms**
   - ny filmsida i en `<iframe>` (nuvarande 0.1.18): ca 1 s
5. Är den dolda ramen `visibility: hidden` ger en film som startar i den ingen bild alls. Är den synlig under den aktiva ramen lyser den nya filmen igenom hålet i den gamla (så syntes nästa film de sista 10 s av en film).
6. Bild→film och film→bild: ingen svart bild (när bilden/filmen förladdades; filmer förladdas inte längre).
7. En film i en ram med `display:none` spelar vidare på videoplanet. Ett prov som döljer ramarna i stället för att ta bort dem visar därför två filmer samtidigt (dubbla bilder, brus i nedre högra hörnet). Samma film ensam i en ny `<video>` utan någon annan video ger ingen brus.

## Vad som är provat

| Försök | Resultat |
|---|---|
| Förladda nästa filmsida bakom den som spelar (dold eller synlig) | Den första filmen fryser, eller så lyser den andra igenom |
| `visibility: hidden` på förladdningsramen | Svart från det att nästa sida börjar laddas |
| Förladda filmen med `preload="auto"` utan `play()` | Den första fryser redan vid skapandet (se 1 ovan) |
| Ladda nästa film först vid bytet (0.1.18), synlig under den gamla, byt när den spelar | Fungerar, svart ca 1 s |
| Byta `src` på en enda `<video>` | Svart ca 0,5 s (bäst hittills; inte inbyggt i spelaren) |
| **MSE** (en `<video>` med `MediaSource`, filmerna fragmenterade till fMP4 med mp4box.js, nästa film tillagd med `timestampOffset`) | MSE finns på skärmen och spelar en liten kontrollfil (640×360) felfritt. Filerna jag provade: i en vanlig webbläsare på datorn spelar de felfritt, även den ena efter den andra i samma `SourceBuffer` (olika profil). **På skärmen:** de riktiga filmerna (1080×1920, High@4.2 och Main@4.0) ger `MEDIA_ERR_DECODE` direkt. En liggande 1920×1080-fil (High@4.2) spelar utan fel men **för långsamt** (7 s uppspelning på 30 s), alltså programvaruavkodning i MSE-vägen, inte hårdvaruavkodning som `<video src>`. 640×360 spelar i realtid. MSE är därför inte användbart för film i full HD på den här skärmen. |
| Samsungs AVPlay (`webapis.avplay`, finns i appen utan extra privilegium) | `open()` av nästa fil medan en spelar ger `InvalidStateError` (en enda spelarinstans). `stop` + `open` + `prepareAsync` + `play` tar ca 0,7 s (stopp till första bild; `prepare` ca 0,56 s, mest nätverk). På den stående skärmen blev bilden **vriden** och det blev en **lång svart period**, så AVPlay-planet följer inte appens orientering. Inte värt att gå vidare med. |

## Idéer som inte är provade

- **Spelaren spelar filmerna själv** med en enda `<video>` som byter `src` (ca 0,5 s svart). Kräver att spelaren känner till filmadressen: den kan läsas ur filmsidans HTML (`/api/sign/m/<id>` → `/api/sign/f/<id>.mp4`), och att filmsidans övriga delar (storlek, `object-fit`) tas över.
- **Slå ihop filmer på servern** (PubLiComTools sätter ihop spellistans följd av filmer till en enda mp4/ström).
- **Avsiktlig övergång:** en kort bildsida (en sekund, svart eller en logotyp) mellan två filmer. Fungerar redan i dag; ingen lucka syns.

## Så mäter man

Skripten i `tools/film-test/` körs mot den körande appen med `tools/cdp_eval.py` (webbinspektören via `sdb`, se `docs/signering.md`):

```
sdb connect <skärmens IP>
sdb -s <IP>:26101 shell 0 debug PubLiPlay0.PubLiPlayer      # skriver ut inspektörens port
python3 -I tools/cdp_eval.py <IP> <port> tools/film-test/<skript>.js 60
```

- `ramlogg.js`: loggar varje sekund vilken ram som syns, dess film (`currentTime`) och om den spelar.
- `skapa-andra-video.js`: spelar film A, skapar sedan en andra video utan `play()` och visar att A fryser; startar sedan B och mäter tiden till första bild.
- `byt-video.js`: mäter tiden till första bild vid byte av `src` på en video mot en ny video.

Skripten tar bort appens ramar och lägger filmer direkt i sidan, så starta om appen efteråt. Adresserna till de två filmerna (`/api/sign/f/<id>.mp4` på `apps-ref.lib.kth.se`) står överst i skripten och behöver bytas mot egna filer. Den svarta luckan syns bara med ögat; den går inte att läsa ur sidan.

## Frågor som är öppna

- Går det att få en lucka under ca 0,2 s? Det som återstår är att slå ihop filmerna på servern (se ovan) eller att acceptera ca 0,5 s med en enda `<video>` som byter `src`.
- Är luckan densamma för alla filmer (codec, upplösning), eller påverkar det? Codec och upplösning på filmerna i proven har inte kontrollerats (skärmen står stående).
- Gäller det andra Tizen-versioner eller skärmmodeller, eller bara QH55R?
