# Film på Samsung-skärmen: varför den stod still (IPv6) och hur man felsöker

Skärm: Samsung QH55R, Tizen 4.0, appen installerad via developer mode. Tidpunkt: 20 oktober 2026.

## Sammanfattning
Uppladdade filmer (`/api/sign/m/<id>` med en `<video>` som läser `/api/sign/f/<id>`) blev svarta, medan bilder och sidor fungerade. Orsaken var **IPv6 på servern**, inte filen, formatet, appen eller certifikaten:

- `apps-ref.lib.kth.se` och `apps.lib.kth.se` har AAAA-poster i DNS, men TCP-anslutning till port 443 över IPv6 fick tidsgräns. På ref saknade brandväggen (`ufw`) en regel för IPv6 på 443 och 80. Maskinerna svarade på ping över IPv6, så det var bara webbporten som inte nåddes.
- Skärmens videouppspelare (en egen komponent, inte webbläsarens nätverk) provar IPv6 först och hänger sig. Webbläsarens egen nätverksdel faller tillbaka på IPv4, så sidor och bilder (som hämtas av webbläsaren) fungerade hela tiden.
- När IPv6 på 443 öppnades på ref spelade både de uppladdade filmerna och w3schools referensfilm, ensamma i tur och ordning. Appens egen spellista spelar nu filmen (1080×1920, buffrad, slingrar).

**Produktion (`apps.lib.kth.se`) hade vid provet fortfarande ingen IPv6 på 443.** Samma problem uppstår där för varje skärm som har IPv6, tills regeln finns även där (eller AAAA-posten tas bort).

## Det som inte var orsaken (så att ingen letar där igen)
- **Filen:** MP4 med `moov` sist och ljudspår går bra; den spelades även över http från en dator. Förberedd för strömning (`moov` först) är bra men behövs inte för att spela.
- **Svarshuvuden:** `Vary` (Next.js), ETag, Last-Modified och Cache-Control spelar ingen roll (provat på en egen testserver).
- **Certifikatkedjan och TLS:** w3schools har samma Let's Encrypt-kedja och spelade.
- **Range/206:** servern svarar rätt; skärmen hämtade filen med Range-förfrågningar och fick 206.
- **Sandbox/iframe:** videon spelade ändå inte när den lades direkt i toppsidan; det var inte iframe-sandboxen.
- **HTTP/1.0 mot 1.1:** ingen skillnad.

## Fällor i proven
- **Spela inte flera videor samtidigt** i ett prov. TV:ns avkodare är begränsade, så de första som får tag på en spelar och resten står still. Det gav mig flera falska resultat. Testa en i taget och rensa mellan varje.
- Webbinspektörns **Network-flik visar inte** filmens begäran (skärmens uppspelare hämtar den själv). Sidor och bilder syns.
- Mac och skärm måste kunna nå varandra. På iPhonens delade nät fungerade det; **VPN och ett inkopplat nätverkskabel** tog trafiken (`route -n get <skärmens IP>` ska visa Wi-Fi-gränssnittet).

## Så felsöker du en körande app på skärmen
1. Developer mode på skärmen (Remote, Macens IP), `sdb connect <IP>`.
2. Starta appen i felsökningsläge: `sdb -s <IP>:26101 shell 0 debug PubLiPlay0.PubLiPlayer`. Svaret anger en port (till exempel `38815`).
3. Webbinspektören (Chrome DevTools-protokollet) finns då på `http://<IP>:<port>/json` (en sidlista med `webSocketDebuggerUrl`). `tools/cdp.py <IP> <port> <sekunder> [--reload]` lyssnar på nätverk, konsol och fel; `tools/cdp_eval.py <IP> <port> <js-fil>` kör ett uttryck i appens huvudsida och skriver ut resultatet (båda bara Pythons standardbibliotek).
4. Läs videons tillstånd: `readyState`, `networkState`, `videoWidth`, `currentTime`. `ready=0` och `network=2` utan fel betyder att uppspelaren aldrig fick data.
5. Serverns logg (`sign-f`-rader i publicomtools) visar vilka Range-förfrågningar skärmens webbläsare gör.

Spelaren själv har också ett felsökningsläge i en vanlig webbläsare: `index.html?debug=1` visar webbläsare, storlek, config, vald lista, sidladdning och skriptfel; `?debugtv` lägger dessutom testvideor i toppsidan och `?debugns` tar bort sandbox. Skärmens adressfält klarar inte flera parametrar med `&`.
