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
- Alla har 3 liv. Bomben har en dold timer: 2–4 minuter första rundan, och
  varje runda blir cirka 15 % kortare, ner till 30 sekunder.
- De första varven tickar pulsen lugnt (två varv, eller ett med 5 spelare eller
  fler). Sedan ökar tempot fram till smällen. Det lugna läget slutar senast när
  halva tiden har gått.
- På startskärmen kryssar man i en eller flera kategorier. Frågorna blandas
  fråga för fråga. Den som sprängs väljer en eller två av dem till nästa runda,
  på skärmen före rundan.
- Rätt svar: nästa spelares namn visas och mobilen skickas. Timern tickar under
  överlämningen, och smäller det då är det mottagaren som förlorar livet.
- Fel svar: 1 sekunds spärr, 3 sekunder dras från bomben och en ny fråga visas.
- Ungefär var tionde fråga byts mot ett frikort som skickar vidare direkt.
- Ordningen slumpas, men alla får en tur per varv och ingen får mobilen två gånger i rad.

### Kategorier

| Kategori | Fråga | Svårt blir det när … |
|---|---|---|
| Flaggor | Flagga → land, eller land → flagga | flaggorna är förväxlingsbara |
| Huvudstäder | Land → huvudstad, eller huvudstad → land | felsvaren är största staden, tidigare huvudstad eller grannens huvudstad |
| Störst | Vilket land är störst till ytan? | länderna är nästan lika stora |
| Flest invånare | Var bor flest människor? | länderna har nästan lika många invånare |
| Världsdel | I vilken världsdel ligger landet? | felsvaren är närliggande världsdelar |
| Siluett | Vilket land har formen? | felsvaren är grannar med liknande form |
| Grannar | Vilket land gränsar (INTE) till landet? | felsvaren ligger i samma region, och INTE-varianten dyker upp |
| Kust | Vilket land saknar kust? | felsvaren är kustländer som är grannar |
| Udda ut | Vilken flagga hör inte till världsdelen? | det udda landet ligger i en granndel och har liknande flagga |

Israel, Palestina, Vatikanstaten, Monaco och Singapore är inte med i
huvudstadsfrågorna (omstridda huvudstäder, eller huvudstaden heter som landet).
Länder i två världsdelar är inte med i Världsdel och Udda ut, och små länder och
utspridda ögrupper inte i Siluett.

### Svårighetstrappa

Svårigheten följer rundan. Trappan har lika många steg som matchen kan ha
rundor (liv × spelare − 1), men minst 10, så att den inte blir för brant med få
spelare. Revansch börjar om från första steget.

- **Kända länder först.** Alla länder är indelade i fem kändhetsgrupper i
  `data/kandhet.json`. Första rundan tar bara grupp 1 (t.ex. Sverige, USA,
  Japan). Sedan blandas svårare grupper in gradvis, så att andelen okända
  länder ökar jämnt, tills sista steget tar grupp 3–5.
- **Olika svåra kategorier.** Kategorier som är svårare i sig (Siluett, Störst,
  Flest invånare, Kust, Huvudstäder) når inte lika högt i trappan som Flaggor.
  Jämförelserna tar inte med mikrostater förrän allra sist, och Grannar frågar
  bara om länder som har en känd granne.
- **Olika först.** Felalternativen ligger långt från rätt svar i början och
  nära på slutet, se tabellen ovan. Flaggornas och siluetternas likhet räknas
  ut från bilderna (`data/flaggfarger.json` och `data/siluettform.json`, tas
  fram med `scripts/fingeravtryck.cjs`).

Spelarens nivå styr antalet alternativ, och Barn får dessutom halva svårigheten:

| Nivå | Alternativ | Svårighet |
|---|---|---|
| Barn | 3 | halva trappan |
| Normal | 4 | hela trappan |
| Nörd | 6 | hela trappan |

## Ljud

Spelets ljud syntetiseras med Web Audio API, bara musiken är ljudfiler. Det är gjort för en
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
- `js/questions.js`: nivåer, svårighetstrappan och flaggfrågor
- `js/categories.js`: alla kategorier och deras felsvar
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
- Typsnitt: [Lilita One](https://fonts.google.com/specimen/Lilita+One) och
  [Nunito](https://fonts.google.com/specimen/Nunito), SIL Open Font License
  (`fonts/OFL-*.txt`). Ligger lokalt så att de fungerar offline.
- Musik: skapad med [Suno](https://suno.com). Vilka rättigheter som gäller beror
  på vilket Suno-abonnemang låtarna gjordes med.
- Landsdata: [mledoze/countries](https://github.com/mledoze/countries), ODbL.
  Befolkning från Världsbanken, kartor från Natural Earth (public domain).
