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
- Alla har 3 liv. Bomben har en dold timer på 20–60 sekunder.
- Frågorna växlar: visa flaggan och välj landet, eller visa landet och välj flaggan.
- Rätt svar: nästa spelares namn visas och mobilen skickas. Timern tickar under
  överlämningen, och smäller det då är det mottagaren som förlorar livet.
- Fel svar: 1 sekunds spärr, 3 sekunder dras från bomben och en ny fråga visas.
- Ungefär var tionde fråga byts mot ett frikort som skickar vidare direkt.
- Ordningen slumpas, men alla får en tur per varv och ingen får mobilen två gånger i rad.

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
- `js/fx.js`: ljud och vibration
- `sw.js`: service worker för offline-läge
- `data/kalla/lander.json`: källdatan, `data/barn.json`: länderna på Barn-nivån

## Publicering

Workflowen `.github/workflows/pages.yml` testar och publicerar till GitHub Pages
vid push till `main`. Slå på det en gång under **Settings → Pages → Source:
GitHub Actions**.

## Kända begränsningar

- Vibration fungerar inte på iPhone (Safari saknar Vibration API).
- På iPhone hörs inget ljud när ljudlöst läge är på.

## Källor och licenser

- Flaggor: [lipis/flag-icons](https://github.com/lipis/flag-icons), MIT-licens (`flaggor/LICENSE-flag-icons.txt`).
- Landsdata: [mledoze/countries](https://github.com/mledoze/countries), ODbL.
  Befolkning från Världsbanken, kartor från Natural Earth (public domain).
