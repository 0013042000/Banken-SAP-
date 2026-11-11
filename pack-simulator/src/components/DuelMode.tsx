import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Player } from '../data/players';
import type { Motion } from '../game/motion';
import { bestOf, drawPack, PACK_ORDER, PACKS, type PackType } from '../game/packs';
import { sfx } from '../game/sound';
import { Card } from './Card';
import { PackOpening } from './PackOpening';

const ROUNDS = 5;
const NAMES = ['Semon', 'Ariel'] as const;
type Who = 0 | 1;

interface RoundResult { readonly packs: readonly (readonly Player[] | null)[] }

interface DuelState {
  readonly packType: PackType;
  readonly round: number; // 0-basiert
  readonly turn: Who;
  readonly rounds: readonly RoundResult[];
  readonly stage: 'open' | 'compare' | 'finished';
}

interface Props { readonly dreamLuck: boolean; readonly motion: Motion; readonly onTeam: () => void }

const fresh = (packType: PackType): DuelState => ({
  packType, round: 0, turn: 0, stage: 'open',
  rounds: Array.from({ length: ROUNDS }, () => ({ packs: [null, null] })),
});

const roundScore = (pack: readonly Player[] | null): number => (pack ? bestOf(pack).ovr : 0);

const DUEL_KEY = 'fps.duel.v1';
const loadDuel = (): DuelState | null => {
  try { const raw = localStorage.getItem(DUEL_KEY); return raw ? (JSON.parse(raw) as DuelState) : null; } catch { return null; }
};
const saveDuel = (d: DuelState | null): void => {
  try { if (d) localStorage.setItem(DUEL_KEY, JSON.stringify(d)); else localStorage.removeItem(DUEL_KEY); } catch { /* ignore */ }
};

export const DuelMode = ({ dreamLuck, motion, onTeam }: Props): ReactElement => {
  const [duel, setDuel] = useState<DuelState | null>(() => loadDuel());
  // Nach einem Neuladen mitten im Zug: bereits gezogenes Pack direkt wieder anzeigen
  const [cards, setCards] = useState<readonly Player[] | null>(() => {
    const d = loadDuel();
    return d && d.stage === 'open' ? d.rounds[d.round]?.packs[d.turn] ?? null : null;
  });
  const busy = useRef(cards !== null);
  const [restored, setRestored] = useState(cards !== null);

  useEffect(() => { saveDuel(duel); }, [duel]);

  if (!duel) {
    return (
      <section className="mode">
        <h2 className="opening-title">Pack-Duell</h2>
        <p className="opening-sub">Semon gegen Ariel · {ROUNDS} Runden · Beste Karte pro Pack zählt</p>
        <p className="opening-sub">Packtyp wählen:</p>
        <div className="pack-select vertical">
          {PACK_ORDER.map((t) => (
            <button key={t} type="button" className={`pack-tab pack-tab-${t}`} onClick={() => { sfx.tap(); setDuel(fresh(t)); }}>
              <span className="pack-tab-name">{PACKS[t].label}</span>
              <span className="pack-tab-sub">{PACKS[t].tagline}</span>
            </button>
          ))}
        </div>
        {dreamLuck && <p className="opening-hint">✨ Traumglück ist aktiv und gilt für beide.</p>}
      </section>
    );
  }

  const totals = [0, 1].map((w) => duel.rounds.reduce((s, r) => s + roundScore(r.packs[w]!), 0));

  const open = (): void => {
    if (busy.current || cards) return;
    busy.current = true;
    setRestored(false);
    const drawn = drawPack(duel.packType, dreamLuck);
    setDuel((d) => {
      if (!d) return d;
      const rounds = d.rounds.map((r, i) => (i === d.round ? { packs: r.packs.map((p, w) => (w === d.turn ? drawn : p)) } : r));
      return { ...d, rounds };
    });
    setCards(drawn);
  };

  const afterPack = (): void => {
    busy.current = false;
    setCards(null);
    setDuel((d) => {
      if (!d) return d;
      if (d.turn === 0) return { ...d, turn: 1 };
      return { ...d, stage: 'compare' };
    });
  };

  const nextRound = (): void => {
    sfx.tap();
    setDuel((d) => {
      if (!d) return d;
      if (d.round + 1 >= ROUNDS) { sfx.win(); return { ...d, stage: 'finished' }; }
      return { ...d, round: d.round + 1, turn: 0, stage: 'open' };
    });
  };

  const scoreboard = (
    <div className="scoreboard">
      {NAMES.map((n, i) => (
        <div key={n} className={`score-box${duel.stage === 'open' && duel.turn === i ? ' active' : ''}`}>
          <div className="score-name">{n}</div>
          <div className="score-total">{totals[i]}</div>
        </div>
      ))}
      <div className="score-round">Runde {Math.min(duel.round + 1, ROUNDS)} / {ROUNDS}</div>
    </div>
  );

  if (duel.stage === 'finished') {
    const [a, b] = totals as [number, number];
    const headline = a === b ? 'Unentschieden!' : `${NAMES[a > b ? 0 : 1]} gewinnt! 🏆`;
    return (
      <section className="mode">
        {scoreboard}
        <div className="winner">
          <div className="winner-text">{headline}</div>
          <div className="winner-sub">{NAMES[0]} {a} : {b} {NAMES[1]}</div>
        </div>
        <div className="round-table">
          {duel.rounds.map((r, i) => (
            <div key={i} className="round-row">
              <span>R{i + 1}</span>
              <strong className={roundScore(r.packs[0]!) > roundScore(r.packs[1]!) ? 'win' : ''}>{roundScore(r.packs[0]!)}</strong>
              <span>:</span>
              <strong className={roundScore(r.packs[1]!) > roundScore(r.packs[0]!) ? 'win' : ''}>{roundScore(r.packs[1]!)}</strong>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-big" onClick={() => { sfx.tap(); busy.current = false; setCards(null); setDuel(fresh(duel.packType)); }}>Revanche 🔁</button>
        <button type="button" className="btn btn-ghost" onClick={() => { sfx.tap(); setDuel(null); }}>Anderes Pack wählen</button>
        <button type="button" className="btn btn-secondary" onClick={onTeam}>⚽ Mein Team ansehen</button>
      </section>
    );
  }

  if (duel.stage === 'compare') {
    const r = duel.rounds[duel.round]!;
    const scores = r.packs.map(roundScore);
    const winner = scores[0]! === scores[1]! ? null : scores[0]! > scores[1]! ? 0 : 1;
    return (
      <section className="mode">
        {scoreboard}
        <h2 className="opening-title">Runde {duel.round + 1} – Ergebnis</h2>
        <p className="opening-sub">{winner === null ? 'Gleichstand in dieser Runde' : `${NAMES[winner]} holt die Runde`}</p>
        <div className="compare">
          {r.packs.map((pk, w) => pk && (
            <div key={w} className={`compare-col${winner === w ? ' compare-win' : ''}`}>
              <div className="compare-name">{NAMES[w]} · <strong>{scores[w]}</strong></div>
              <Card player={bestOf(pk)} size="sm" highlight={winner === w} />
              <div className="compare-rest">
                {[...pk].sort((x, y) => y.ovr - x.ovr).slice(1).map((c) => <span key={c.id} className={`chip chip-${c.cat}`}>{c.ovr} {c.name.split(' ').slice(-1)[0]}</span>)}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-big" onClick={nextRound}>{duel.round + 1 >= ROUNDS ? 'Endergebnis anzeigen' : 'Nächste Runde'}</button>
      </section>
    );
  }

  return (
    <section className="mode">
      {scoreboard}
      <div className="turn-banner">👉 <strong>{NAMES[duel.turn]}</strong> ist dran</div>
      <PackOpening
        packType={duel.packType}
        cards={cards}
        motion={motion}
        onOpen={open}
        onNext={afterPack}
        nextLabel={duel.turn === 0 ? `Weiter: ${NAMES[1]} ist dran` : 'Ergebnisse vergleichen'}
        revealed={restored}
      />
    </section>
  );
};
