# Ariel's Epic Packs

Fußballspiel für den Browser (React, TypeScript, Vite), gebaut für Semon und Ariel und fürs Handy gedacht.
Eigener Simulator mit fiktiven Bewertungen, Sonderkarten und Ziehchancen – keine Verbindung zu EA.

## Bereiche

| Bereich | Inhalt |
| --- | --- |
| **Packs** | Gold-, Star- und Legenden-Pack mit Garantien, Schalter „Traumglück“, Pack-Duell auf einem Gerät, Walkout-Vorschau |
| **Sammlung** | Gezogene Karten mit Filter und Suche, „Ins Team“ |
| **Mein Team** | Eigene Mannschaften für Semon und Ariel (fünf Formationen), automatisch oder von Hand aufstellen |
| **Draft** | Formation, Kapitän, dann 23 Spieler aus je fünf Angeboten; Gemischt, Legenden oder Traum |
| **Spielen** | Fünf gegen fünf in der Draufsicht: gegen den Computer oder online im privaten Raum |

### Walkout

Ab Bewertung 86 tritt eine animierte Spielerfigur auf (Three.js, erst bei Bedarf geladen):
86–89 kurzer Auftritt, ab 90 voller Walkout aus dem Tunnel, Legenden auf goldener Bühne, ab 95 mit Feuerwerk und Sonderjubel.
Die Figuren sind **stilisierte Avatare** aus einfachen Formen (Hautton, Frisur, Statur, Trikot in Landesfarben) – keine Nachbildungen.
Ohne WebGL oder wenn die Szene nicht lädt, erscheint eine Ersatzenthüllung ohne Figur.
Einstellungen: Animation „Automatisch / Voll / Reduziert“ und Ton.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm run typecheck  # TypeScript (App und Spielserver)
npm test           # Logiktests (Vitest)
npm run lint       # oxlint
npm run build      # Produktions-Build nach dist/
npm run server     # Spielserver für das Online-Spiel (Port 8787)
```

Die Version im Info-Bereich (Einstellungen) ist der kurze Commit-Hash des Builds; ein „+“ bedeutet nicht eingecheckte Änderungen.

## Online-Spiel: eigener Spielserver nötig

Das Online-Spiel braucht den kleinen Node-Server aus `server/` (WebSocket unter `/ws`). Er führt die Simulation
verbindlich aus; die Geräte senden nur Eingaben. Derselbe Server liefert auch das gebaute Frontend aus `dist/` aus,
sodass **ein** Deployment genügt:

```bash
npm install && npm run build
PORT=8787 npm run server      # danach http://<adresse>:8787 auf beiden Geräten öffnen
```

- Benötigt Node 22.18 oder neuer (führt TypeScript direkt aus). Keine Datenbank, keine Zugangsdaten.
- Liegt das Frontend woanders, die Server-Adresse beim Build setzen: `VITE_GAME_SERVER=wss://mein-server/ws npm run build`.
- Auf statischem Hosting ohne diesen Server (z. B. der bisherigen claude.ai-Seite, die Verbindungen zu fremden Servern
  sperrt) zeigt der Online-Modus eine klare Meldung; das Spiel gegen den Computer funktioniert überall.
- Im selben WLAN reicht es, den Server auf einem Rechner zu starten und auf beiden Handys `http://<IP-des-Rechners>:8787` zu öffnen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/data/players.ts` | 243 reale Personen (130 Legenden), Karten und Sonderkarten, abgeleitete Werte |
| `src/data/looks.ts` | Aussehen der Avatare und Trikotfarben |
| `src/game/packs.ts`, `reveal.ts` | Ziehlogik, Garantien, Ablauf der Enthüllung |
| `src/game/team.ts` | Formationen, Positionszuordnung, automatische Aufstellung, Mannschaften je Profil |
| `src/game/draft/` | Draft-Varianten, Angebote, Zustandsautomat, Speicherung |
| `src/walkout/` | 3D-Szene, Avatar, Posen und Jubel |
| `src/football/sim/` | Deterministische Spielsimulation (läuft im Browser und im Server) |
| `src/football/net/`, `server/` | Protokoll, Client und Spielserver für das Online-Spiel |
| `src/components/` | Oberfläche der Bereiche |

Gespeichert wird nur lokal im Browser (`localStorage`): Sammlung, Einstellungen, Mannschaften, Drafts und Pack-Duell.
Ein altes gemeinsames Team wird beim ersten Start als „Gemeinsam“ übernommen.

Die Prüfseiten `src/components/draft/dev.html` und `src/football/dev/index.html` sind nur im Entwicklungsserver erreichbar.

## Bilder

Spielerporträts stammen aus Wikimedia Commons unter freien Lizenzen; Urheber und Lizenz stehen in
`src/data/credits.json` und in der App unter „Bildnachweise“. 3D-Modelle, Animationen und Töne sind selbst erzeugt.
