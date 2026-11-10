# Ariel's Epic Packs – Fußball-Pack-Simulator

Spielbarer Pack-Opening-Simulator (React + TypeScript + Vite), komplett ohne Backend.

- **Freies Pack-Opening**: Gold-, Star- und Legenden-Pack mit echten Garantien, Schalter „Traumglück“, Demo-Walkout.
- **Enthüllung in Stufen**: unter 86 kurz, 86–89 mit Lichtstrahlen und Partikeln, ab 90 ein Walkout mit Spielertunnel und
  Stadionlicht, Legenden in Gold/Elfenbein, ab 95 zusätzlich Lichtausbruch und Konfetti. Beste Karte zuerst, danach Haltebild.
- **Mein Team**: Elf aus der eigenen Sammlung auf dem Spielfeld aufstellen (4-3-3 oder 4-4-2), von Hand oder per
  „Bestes Team aufstellen“. Teamwertung = gerundeter Durchschnitt der aufgestellten Spieler.
- **Pack-Duell**: Semon gegen Ariel, 5 Runden auf einem Gerät, beste Karte pro Pack zählt.
- **Sammlung**: in `localStorage` gespeichert, Filter, Suche, „Ins Team“, Zurücksetzen mit Bestätigung.

```bash
npm install
npm run dev        # Entwicklungsserver
npm run typecheck  # TypeScript prüfen
npm test           # Logiktests (Vitest)
npm run lint       # oxlint
npm run build      # Produktions-Build nach dist/
```

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/data/players.ts` | Spielerbestand, abgeleitete Kartenwerte, Kurznamen |
| `src/game/packs.ts` | Ziehlogik, Gewichte, Packgarantien, Traumglück |
| `src/game/reveal.ts` | Enthüllungsreihenfolge, Stufen und Zeitsteuerung der Animation |
| `src/game/team.ts` | Formationen, Positionszuordnung, automatische Aufstellung, Teamwertung, Validierung |
| `src/game/storage.ts` | Speicherung in `localStorage` mit Validierung |
| `src/components/PackOpening.tsx` | Zentrale Enthüllungskomponente für freien Modus und Duell |
| `src/components/TeamView.tsx` | Spielfeld, Auswahl- und Bestätigungsdialoge |

Die öffentliche Seite wird nicht automatisch aktualisiert: Nach Änderungen muss `dist/` dort neu veröffentlicht werden.

Eigener Simulator · fiktive Bewertungen und Ziehchancen · keine Verbindung zu EA.
