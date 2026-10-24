# Passa flaggan

Ett partyspel om flaggor för en mobil och ett helt sällskap. Mobilen är en bomb
med dold timer: svara rätt på flaggan och skicka mobilen till den vars namn
dyker upp. Den som håller mobilen när det smäller förlorar ett liv. Sist kvar
vinner.

Spelet är en installerbar webbapp utan konton eller server, och fungerar helt
offline när det har öppnats en gång.

## Regler (version 1)

- 2–8 spelare med alias och ålder. Åldern föreslår en nivå (under 9 Barn,
  9–14 Normal, 15+ Nörd) som går att ändra.
- Alla har 3 liv. Bomben har en dold timer på 2–4 minuter.
- De två första varven tickar pulsen lugnt. Sedan ökar tempot fram till smällen.
  Det lugna läget slutar senast när halva tiden har gått.
- Frågorna växlar: visa flaggan och välj landet, eller visa landet och välj flaggan.
- Rätt svar: nästa spelares namn visas och mobilen skickas. Timern tickar under
  överlämningen, och smäller det då är det mottagaren som förlorar livet.
- Fel svar: 1 sekunds spärr, 3 sekunder dras från bomben och en ny fråga visas.
- Ungefär var tionde fråga byts mot ett frikort som skickar vidare direkt.
- Ordningen slumpas, men alla får en tur per varv och ingen får mobilen två gånger i rad.

## Ljud

Allt ljud syntetiseras med Web Audio API, utan ljudfiler. Det är gjort för en
stor Bluetooth-högtalare men mixat så att det hörs även i mobilens egen
högtalare. Högtalaren bär stämningen och mobilen ger personlig återkoppling med
färg och vibration.

- **Puls:** ett hjärtslag som ligger lugnt på 60 slag per minut de första
  varven och sedan ökar till 180 slag per minut fram till smällen.
  Ibland saktar det in en stund (en fint) så att man inte kan räkna ut timern.
  Ett fel svar får tempot att hoppa upp direkt.
- **Rätt och fel:** en kort swoosh och ett kort surr, under 200 ms.
- **Smällen:** en dov bomb med sub-bas, dån och ett långt muller. Allt tystnar och skärmen fryser i cirka 0,3 s plus
  Bluetooth-fördröjningen (`outputLatency`, annars 0,2 s). Sedan kommer
  smällen i ljud och bild samtidigt.
- **Keep-alive:** ett nästan ohörbart brus under hela matchen, så att
  högtalaren inte somnar och klipper början av nästa ljud.
- En limiter sist i kedjan hindrar smällen från att klippa.
- Ljud av/på finns på startskärmen och i pausrutan.
- **Musik:** lobbyn har låg menymusik (`ljud/meny.mp3`, loopar) som börjar vid
  första trycket, eftersom webbläsare inte tillåter ljud innan dess. När bara en
  spelare är kvar spelas vinnarlåten (`ljud/vinnare.mp3`). Under matchen spelas
  ingen musik.

### Svårighetstrappa

Svårigheten följer rundan och är samma för alla. Trappan har lika många steg
som matchen kan ha rundor (liv × spelare − 1): 5 steg med 2 spelare, 8 med 3
och så vidare. Revansch börjar om från första steget.

- **Kända länder först.** Alla länder är indelade i fem kändhetsgrupper i
  `data/kandhet.json`. Första rundan tar bara grupp 1 (t.ex. Sverige, USA,
  Japan), och sedan flyttas fönstret uppåt till grupp 3–5 på sista steget.
- **Olika flaggor först.** Felalternativen väljs efter hur lika flaggorna ser
  ut: helt olika flaggor i början, förväxlingsbara på slutet. Likheten räknas
  ut från flaggornas färger i ett rutnät (`data/flaggfarger.json`, tas fram
  med `scripts/flaggfarger.cjs`).

Spelarens nivå styr bara antalet alternativ:

| Nivå | Alternativ |
|---|---|
| Barn | 3 |
| Normal | 4 |
| Nörd | 6 |

## Ljud

Allt ljud syntetiseras med Web Audio API, utan ljudfiler. Det är gjort för en
stor Bluetooth-högtalare men mixat så att det hörs även i mobilens egen
högtalare. Högtalaren bär stämningen och mobilen ger personlig återkoppling med
färg och vibration.

- **Puls:** ett hjärtslag som ligger lugnt på 60 slag per minut de första
  varven och sedan ökar till 180 slag per minut fram till smällen.
  Ibland saktar det in en stund (en fint) så att man inte kan räkna ut timern.
  Ett fel svar får tempot att hoppa upp direkt.
- **Rätt och fel:** en kort swoosh och ett kort surr, under 200 ms.
- **Smällen:** en dov bomb med sub-bas, dån och ett långt muller. Allt tystnar och skärmen fryser i cirka 0,3 s plus
  Bluetooth-fördröjningen (`outputLatency`, annars 0,2 s). Sedan kommer
  smällen i ljud och bild samtidigt.
- **Keep-alive:** ett nästan ohörbart brus under hela matchen, så att
  högtalaren inte somnar och klipper början av nästa ljud.
- En limiter sist i kedjan hindrar smällen från att klippa.
- Ljud av/på finns på startskärmen och i pausrutan.
- **Musik:** lobbyn har låg menymusik (`ljud/meny.mp3`, loopar) som börjar vid
  första trycket, eftersom webbläsare inte tillåter ljud innan dess. När bara en
  spelare är kvar spelas vinnarlåten (`ljud/vinnare.mp3`). Under matchen spelas
  ingen musik.

| Nivå | Alternativ | Länder |
|---|---|---|
| Barn | 3 | 40 kända länder, se `data/barn.json` |
| Normal | 4 | De 193 FN-länderna |
| Nörd | 6 | Alla 197, med förväxlingsbara flaggor som alternativ |

## Utveckling

Inga beroenden behövs, bara Node 22 och Python för den lokala servern.

```sh
npm start        # http://localhost:8000
npm test         # tester av spelmotorn
npm run build    # efter ändringar i data/, js/, css/, index.html eller icons/
```

`npm run build` genererar `data/countries.json` och `precache.js` (listan med
filer som sparas för offline-läge, med en version som ändras när innehållet
ändras). Båda ska checkas in. CI kontrollerar att de är aktuella.

### Struktur

- `js/game.js`: spelmotorn (faser, bomb, liv, frikort), utan DOM
- `js/questions.js`: frågor och felaktiga alternativ per nivå
- `js/order.js`: turordningen
- `js/main.js`: gränssnittet
- `js/audio.js`: ljudmotorn (puls, effekter, smäll, keep-alive) och vibration
- `js/tempo.js`: pulsens tempo och finter
- `sw.js`: service worker för offline-läge
- `data/kalla/lander.json`: källdatan, `data/kandhet.json`: kändhetsgrupperna

## Publicering

Workflowen `.github/workflows/pages.yml` testar och publicerar till GitHub Pages
vid push till `main`. Slå på det en gång under **Settings → Pages → Source:
GitHub Actions**.

## Kända begränsningar

- Vibration fungerar inte på iPhone (Safari saknar Vibration API).
- På iPhone sätts `navigator.audioSession.type = "playback"` så att ljudet
  hörs trots ljudlöst läge. Det kräver iOS 16.4 eller senare.
- Keep-alive-bruset ligger på cirka −72 dBFS. Om högtalaren ändå somnar kan
  `KEEPALIVE_GAIN` i `js/audio.js` höjas.

## Källor och licenser

- Flaggor: [lipis/flag-icons](https://github.com/lipis/flag-icons), MIT-licens (`flaggor/LICENSE-flag-icons.txt`).
- Musik: skapad med [Suno](https://suno.com). Vilka rättigheter som gäller beror
  på vilket Suno-abonnemang låtarna gjordes med.
- Landsdata: [mledoze/countries](https://github.com/mledoze/countries), ODbL.
  Befolkning från Världsbanken, kartor från Natural Earth (public domain).
