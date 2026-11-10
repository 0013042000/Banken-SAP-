# Pack-Arena – Fußball-Pack-Simulator

Spielbarer Pack-Opening-Simulator (React + TypeScript + Vite), komplett ohne Backend.

- **Freies Pack-Opening**: Gold-, Star- und Legenden-Pack mit echten Garantien, Schalter „Traumglück“, Demo-Walkout.
- **Pack-Duell**: Semon gegen Ariel, 5 Runden auf einem Gerät, beste Karte pro Pack zählt.
- **Sammlung**: in `localStorage` gespeichert, Filter, Suche, Zurücksetzen mit Bestätigung.

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Produktions-Build nach dist/
```

Ziehgewichte und Packgarantien: `src/game/packs.ts`. Spielerdaten: `src/data/players.ts`.

Eigener Simulator · fiktive Bewertungen und Ziehchancen · keine Verbindung zu EA.
