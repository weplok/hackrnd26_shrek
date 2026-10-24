import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { content } from "./content.ts";
import * as E from "@zero-day/engine";
import type { GameState, Case, Difficulty } from "@zero-day/engine";
import { Profile, defaultProfile, loadProfile, saveProfile, lastNick } from "./profile.ts";

type Tier = "easy" | "med" | "hard";
const TIERS: Record<Tier, { label: string; mult: number; decay: number; hints: any; prewarn: boolean; note: string }> = {
  easy: { label: "Лёгкий", mult: 0.6, decay: 3, hints: { frequency: "high", depth: "answer" }, prewarn: true, note: "тревога ×0.6, остывает, подсказки" },
  med: { label: "Средний", mult: 1.0, decay: 1, hints: { frequency: "medium", depth: "direction" }, prewarn: true, note: "тревога ×1.0" },
  hard: { label: "Хард", mult: 1.5, decay: 0, hints: { frequency: "low", depth: "nudge" }, prewarn: false, note: "тревога ×1.5, не остывает" },
};
const CASE_ORDER = content.campaign.levels.flatMap((l) => l.cases);

function levelOf(caseId: string) {
  return content.campaign.levels.find((l) => l.cases.includes(caseId))!;
}
function effDiff(caseId: string, tier: Tier): Difficulty {
  const lvl = levelOf(caseId);
  const t = TIERS[tier];
  return {
    noiseMultiplier: t.mult, alarmDecayPerTick: t.decay,
    wrongGuessNoise: lvl.difficulty.wrongGuessNoise, hints: t.hints,
    flipperPreWarn: t.prewarn, puzzleKnobs: lvl.difficulty.puzzleKnobs,
  };
}
function seededShuffle<T>(seed: number, arr: T[]): T[] {
  const a = arr.slice(); let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function candidateVulns(node: any): string[] {
  const real = node.exploits.map((e: any) => e.vuln);
  const all = Object.keys(content.vulnerabilities);
  const pool = all.filter((v) => !real.includes(v));
  const seed = [...node.id].reduce((x, ch) => x + ch.charCodeAt(0), 0);
  const decoys = seededShuffle(seed, pool).slice(0, 2);
  return seededShuffle(seed + 1, [...real, ...decoys]);
}
function flipperMood(alarm: number) { return alarm >= 70 ? "bark" : alarm >= 35 ? "alert" : "idle"; }

export function App() {
  const [screen, setScreen] = useState<"menu" | "intro" | "hub" | "mission">("menu");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [caseId, setCaseId] = useState<string>(CASE_ORDER[0]);
  const [codexOpen, setCodexOpen] = useState(false);

  useEffect(() => { if (profile) saveProfile(profile); }, [profile]);

  if (screen === "menu") return <Menu onNew={(n) => { setProfile(defaultProfile(n)); setScreen("intro"); }}
    onContinue={(n) => { setProfile(loadProfile(n) ?? defaultProfile(n)); setScreen("hub"); }} />;
  if (!profile) { setScreen("menu"); return null; }
  if (screen === "intro") return <Intro onDone={() => setScreen("hub")} />;
  if (screen === "hub") return (<>
    <Hub profile={profile} setProfile={setProfile} onPlay={(id) => { setCaseId(id); setScreen("mission"); }} onCodex={() => setCodexOpen(true)} onMenu={() => setScreen("menu")} />
    {codexOpen && <CodexModal profile={profile} onClose={() => setCodexOpen(false)} />}
  </>);
  return (<>
    <Mission caseId={caseId} profile={profile} setProfile={setProfile} onExit={() => setScreen("hub")} onCodex={() => setCodexOpen(true)}
      onNext={() => { const i = CASE_ORDER.indexOf(caseId); if (i < CASE_ORDER.length - 1) setCaseId(CASE_ORDER[i + 1]); setScreen("hub"); }} />
    {codexOpen && <CodexModal profile={profile} onClose={() => setCodexOpen(false)} />}
  </>);
}

function Title({ children, dot }: { children: ReactNode; dot?: string }) {
  return <div className="title"><span className="dot" style={{ background: dot ?? "var(--teal)" }} /><span>{children}</span></div>;
}

function Menu({ onNew, onContinue }: { onNew: (n: string) => void; onContinue: (n: string) => void }) {
  const [nick, setNick] = useState(lastNick());
  const t = nick.trim();
  const hasSave = t ? !!loadProfile(t) : false;
  return (
    <div className="center">
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <div className="mono" style={{ color: "var(--teal)", letterSpacing: 4, fontSize: 12 }}>// пентест-симулятор</div>
        <h1 style={{ fontSize: 60, letterSpacing: 4, margin: "12px 0 2px" }}>ZERO<span style={{ color: "var(--amber)" }}>·</span>DAY</h1>
        <div style={{ color: "var(--mut)" }}>думать, а не стучать по клавишам</div>
      </div>
      <div className="card" style={{ maxWidth: 420, margin: "40px auto 0" }}>
        <Title>ВХОД ОПЕРАТОРА</Title>
        <div style={{ padding: 22 }}>
          <label className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "var(--mut)" }}>НИКНЕЙМ</label>
          <div className="row" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginTop: 8, background: "var(--bg)" }}>
            <span className="mono" style={{ color: "var(--teal)" }}>&gt;</span>
            <input value={nick} maxLength={18} onChange={(e: any) => setNick(e.target.value)} placeholder="ghost"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--white)", fontSize: 16 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
            <button className="btn solid" disabled={!t} onClick={() => onNew(t)}>НОВАЯ ИГРА</button>
            <button className="btn" disabled={!hasSave} onClick={() => onContinue(t)}>ПРОДОЛЖИТЬ{hasSave ? "" : " — нет сохранения"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Intro({ onDone }: { onDone: () => void }) {
  const lines = [
    { c: "var(--teal)", t: "// инициализация профиля оператора" },
    { c: "var(--white)", t: "Ты — пентестер. «Белая шляпа»." },
    { c: "var(--mut)", t: "Компании и люди сами нанимают тебя: взломай их раньше преступников и покажи дыры. Всё — по договору и в рамках." },
    { c: "var(--mut)", t: "Осматривай узлы, собирай улики, складывай ключи на Доске и применяй — к машине или к человеку. Любое действие поднимает тревогу." },
    { c: "var(--teal)", t: "Рядом Флиппер: дремлет, когда тихо; рычит, когда горячо." },
  ];
  return (
    <div className="center">
      <div className="card" style={{ marginTop: 24 }}>
        <Title>БРИФИНГ</Title>
        <div style={{ padding: "22px 24px" }}>
          {lines.map((l, i) => <p key={i} className={i === 0 ? "mono" : ""} style={{ color: l.c, lineHeight: 1.6, margin: "0 0 12px" }}>{l.t}</p>)}
          <button className="btn solid" onClick={onDone} style={{ marginTop: 8 }}>К заданиям →</button>
        </div>
      </div>
    </div>
  );
}

function Hub({ profile, setProfile, onPlay, onCodex, onMenu }:
  { profile: Profile; setProfile: (p: Profile) => void; onPlay: (id: string) => void; onCodex: () => void; onMenu: () => void }) {
  const codexCount = Object.keys(profile.codex).length;
  const total = Object.keys(content.codex).length;
  return (
    <div className="wrap">
      <div className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: 2 }}>ZERO<span style={{ color: "var(--amber)" }}>·</span>DAY</span>
        <span className="mono" style={{ color: "var(--mut)" }}>оператор: {profile.nick}</span>
        <div className="row" style={{ marginLeft: "auto" }}>
          <button className="btn sm" onClick={onCodex}>📘 Кодекс · {codexCount}/{total}</button>
          <button className="btn sm" onClick={onMenu} style={{ color: "var(--mut)" }}>меню</button>
        </div>
      </div>
      <div className="grid-main" style={{ marginTop: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Контракты</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CASE_ORDER.map((id, i) => {
              const c = content.cases[id];
              const lvl = levelOf(id);
              const unlocked = i === 0 || !!profile.completed[CASE_ORDER[i - 1]];
              const done = profile.completed[id];
              return (
                <div key={id} className="card" style={{ opacity: unlocked ? 1 : .5, borderColor: done ? "var(--grass)" : "var(--line)" }}>
                  <Title dot={lvl.accent}>{lvl.title} · {id}</Title>
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 18, marginBottom: 6 }}>{c.title}</h3>
                    <p style={{ color: "var(--mut)", fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>{c.brief.text}</p>
                    {done && <div style={{ color: "var(--green)", fontSize: 12, marginBottom: 8 }}>✓ пройдено · {done.rank} · {done.ticks} ход · тревога max {done.maxAlarm}%</div>}
                    {unlocked
                      ? <button className={"btn " + (done ? "" : "solid")} onClick={() => onPlay(id)}>{done ? "пройти снова" : "начать контракт →"}</button>
                      : <span className="mono" style={{ fontSize: 12, color: "var(--mut)" }}>🔒 сначала: {content.cases[CASE_ORDER[i - 1]].title}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="card">
            <Title dot="var(--amber)">СЛОЖНОСТЬ</Title>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {(Object.keys(TIERS) as Tier[]).map((k) => {
                const on = profile.difficulty === k;
                return (
                  <button key={k} onClick={() => setProfile({ ...profile, difficulty: k })}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "1px solid " + (on ? "var(--teal)" : "var(--line)"), background: on ? "rgba(79,209,197,.08)" : "transparent" }}>
                    <div style={{ fontWeight: 700, color: on ? "var(--teal)" : "var(--white)" }}>{TIERS[k].label}</div>
                    <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>{TIERS[k].note}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color, bar, barColor, sub }:
  { label: string; value: string; color?: string; bar?: number; barColor?: string; sub?: string }) {
  return (
    <div className="metric">
      <div className="lbl">{label}</div>
      <div className="val" style={{ color: color ?? "var(--white)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--mut)" }}>{sub}</div>}
      {typeof bar === "number" && <div className="bar"><div style={{ width: bar + "%", background: barColor }} /></div>}
    </div>
  );
}

function Flipper({ alarm }: { alarm: number }) {
  const m = flipperMood(alarm);
  const face = m === "bark" ? "◣(ΦωΦ)◢" : m === "alert" ? "(•ᴥ•)⚠" : "(－ω－) zzz";
  const line = m === "bark" ? "Флиппер лает — нас почти засекли!" : m === "alert" ? "Флиппер рычит." : "Флиппер дремлет.";
  const col = m === "bark" ? "var(--red)" : m === "alert" ? "var(--amber)" : "var(--grass)";
  return <div className="card" style={{ padding: "12px 14px", borderColor: m === "bark" ? "var(--red)" : "var(--line)" }}>
    <div className="mono" style={{ fontSize: 18, color: col }}>{face}</div>
    <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 6 }}>{line}</div>
  </div>;
}

function logColor(k: string) {
  return k === "ok" ? "var(--green)" : k === "bad" ? "var(--red)" : k === "key" ? "var(--grass)" : k === "clue" ? "var(--amber)" : k === "cmd" ? "var(--white)" : "var(--teal)";
}

function Mission({ caseId, profile, setProfile, onExit, onCodex, onNext }:
  { caseId: string; profile: Profile; setProfile: (p: Profile) => void; onExit: () => void; onCodex: () => void; onNext: () => void }) {
  const c: Case = content.cases[caseId];
  const [gs, setGs] = useState<GameState>(() => E.createGame(content, caseId, effDiff(caseId, profile.difficulty)));
  const [sel, setSel] = useState<string | null>(null);
  const [pickClues, setPickClues] = useState<Record<string, boolean>>({});
  const savedRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const run = (fn: (c: typeof content, s: GameState) => GameState) => setGs((s) => fn(content, s));

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [gs.log]);
  useEffect(() => {
    if (gs.phase === "won" && !savedRef.current) {
      savedRef.current = true;
      const np: Profile = structuredClone(profile);
      np.completed[caseId] = { rank: gs.rank ?? "—", ticks: gs.tick, maxAlarm: gs.maxAlarm };
      for (const k of Object.keys(gs.codex)) np.codex[k] = true;
      np.style.tech += gs.techActions; np.style.social += gs.socialActions;
      setProfile(np);
    }
  }, [gs.phase]);

  const alarm = gs.tracks.alarm ?? 0;
  const alarmCol = alarm >= 70 ? "var(--red)" : alarm >= 35 ? "var(--amber)" : "var(--teal)";
  const selNode = sel ? c.nodes.find((n) => n.id === sel) ?? null : null;
  const ownedClues = Object.keys(gs.clues).filter((k) => gs.clues[k]);
  const ownedKeys = Object.keys(gs.keys).filter((k) => gs.keys[k]);
  const clueText = (id: string) => c.clues.find((x) => x.id === id)?.text ?? id;

  function doCombine() {
    const picked = Object.keys(pickClues).filter((k) => pickClues[k]);
    if (picked.length) { run((ct, s) => E.combine(ct, s, picked)); setPickClues({}); }
  }

  return (
    <div className="wrap">
      <div className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>ZERO<span style={{ color: "var(--amber)" }}>·</span>DAY</span>
        <span style={{ fontWeight: 600 }}>{c.title}</span>
        <div className="row" style={{ marginLeft: "auto" }}>
          <button className="btn sm" onClick={onCodex}>📘 Кодекс</button>
          <button className="btn sm" onClick={onExit}>← задания</button>
        </div>
      </div>

      <div className="row" style={{ margin: "14px 0" }}>
        <Metric label="ТРЕВОГА" value={alarm + "%"} color={alarmCol} bar={alarm} barColor={alarmCol} />
        <Metric label="ХОДЫ" value={String(gs.tick)} />
        <Metric label="СКАНОВ" value={String(gs.scans)} />
        <Metric label="СТИЛЬ" value={E.profileStyle(gs)} color="var(--mut)" />
        <div style={{ marginLeft: "auto" }} className="row">
          <button className="btn sm" onClick={() => run((ct, s) => E.wait(ct, s))}>⏸ переждать</button>
          <button className="btn sm" style={{ color: "var(--mut)" }} onClick={() => { savedRef.current = false; setGs(E.createGame(content, caseId, effDiff(caseId, profile.difficulty))); }}>↻ заново</button>
        </div>
      </div>

      <div className="grid-main">
        <div className="card">
          <Title dot={levelOf(caseId).accent}>СЕТЕВАЯ КАРТА · {c.brief.client}</Title>
          <div className="board">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              {c.edges.map((e, i) => {
                const a = c.nodes.find((n) => n.id === e.from)!; const b = c.nodes.find((n) => n.id === e.to)!;
                if (!gs.nodes[e.from]?.revealed || !gs.nodes[e.to]?.revealed) return null;
                const live = gs.nodes[e.from]?.compromised && !gs.nodes[e.to]?.compromised;
                return <line key={i} x1={a.position.x} y1={a.position.y} x2={b.position.x} y2={b.position.y}
                  stroke={gs.nodes[e.from]?.compromised ? (live ? "var(--teal)" : "var(--grass)") : "var(--line)"} strokeWidth={live ? 0.7 : 0.5} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            {c.nodes.filter((n) => gs.nodes[n.id]?.revealed).map((n) => {
              const rt = gs.nodes[n.id]; const isSel = sel === n.id; const oos = !n.inScope;
              const isTarget = n.kind === "target", isPerson = n.kind === "person";
              let bd = "var(--dim)", fg = "var(--mut)", bg = "var(--panel2)";
              if (rt.secured) { bd = "var(--teal)"; fg = "var(--teal)"; }
              else if (rt.compromised) { bd = "var(--grass)"; fg = "var(--green)"; bg = "rgba(58,169,129,.12)"; }
              else if (oos) { bd = "var(--red)"; fg = "var(--red)"; }
              else if (rt.scanned) { bd = "var(--teal)"; fg = "var(--white)"; }
              const canAct = !rt.compromised && !oos;
              const glyph = isPerson ? "☺" : isTarget ? "◎" : "▢";
              const st = rt.secured ? "ЗАЩИЩЁН" : rt.compromised ? "ВЗЯТ" : oos ? "ВНЕ SCOPE" : rt.scanned ? "ОСМОТРЕН" : isPerson ? "человек" : "не осмотрен";
              return (
                <button key={n.id} className={"node" + (canAct && !rt.scanned && !isPerson ? " pulse" : "")}
                  onClick={() => setSel(n.id)} style={{ left: n.position.x + "%", top: n.position.y + "%", border: "2px " + (oos ? "dashed" : "solid") + " " + bd, color: fg, background: bg, outline: isSel ? "2px solid var(--white)" : "none", outlineOffset: 2, borderRadius: isPerson ? 20 : 8 }}>
                  <div className="glyph" style={{ color: isTarget ? "var(--amber)" : fg }}>{glyph}</div>
                  <div className="nm">{n.label}</div>
                  <div className="st" style={{ color: rt.compromised ? "var(--grass)" : oos ? "var(--red)" : rt.scanned ? "var(--teal)" : "var(--dim)" }}>{st}</div>
                </button>
              );
            })}
          </div>
        </div>

        <Inspector node={selNode} gs={gs} c={c} run={run} setGs={setGs} />
      </div>

      <div className="grid-bottom">
        <div className="card">
          <Title dot="var(--amber)">ДОСКА УЛИК</Title>
          <div style={{ padding: 12 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--mut)", marginBottom: 8 }}>УЛИКИ — выбери и собери ключ</div>
            {ownedClues.length === 0 && <div style={{ fontSize: 12.5, color: "var(--dim)" }}>Пусто. Осматривай узлы и говори с людьми.</div>}
            <div className="row" style={{ gap: 7 }}>
              {ownedClues.map((id) => (
                <button key={id} className={"chip" + (pickClues[id] ? " on" : "")} onClick={() => setPickClues((p) => ({ ...p, [id]: !p[id] }))}>{clueText(id)}</button>
              ))}
            </div>
            {ownedClues.length > 0 && <button className="btn amber sm" style={{ marginTop: 12 }} onClick={doCombine}>⚙ собрать ключ</button>}
            <div className="mono" style={{ fontSize: 11, color: "var(--mut)", margin: "16px 0 8px" }}>КЛЮЧИ</div>
            {ownedKeys.length === 0 && <div style={{ fontSize: 12.5, color: "var(--dim)" }}>Нет ключей.</div>}
            <div className="row" style={{ gap: 7 }}>
              {ownedKeys.map((id) => <span key={id} className="chip key">🔑 {c.keyRecipes.find((r) => r.output === id)?.label ?? id}</span>)}
            </div>
          </div>
        </div>
        <div className="card">
          <Title>КОНСОЛЬ</Title>
          <div className="console scroll" ref={logRef}>
            {gs.log.map((l, i) => <div key={i} style={{ color: logColor(l.kind), whiteSpace: "pre-wrap" }}>{l.t}</div>)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <Title dot="var(--teal)">ЦЕЛИ</Title>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {c.objectives.map((o) => (
            <div key={o.id} style={{ fontSize: 13, color: gs.objectives[o.id] ? "var(--green)" : "var(--mut)" }}>
              {gs.objectives[o.id] ? "✓" : "○"} {o.title}
            </div>
          ))}
        </div>
      </div>

      {gs.phase === "briefing" && <BriefOverlay c={c} onStart={() => run((ct, s) => E.startCase(ct, s))} onExit={onExit} />}
      {gs.activePuzzle && <PuzzleOverlay gs={gs} run={run} />}
      {gs.activeChat && <ChatOverlay gs={gs} c={c} run={run} />}
      {gs.pendingScope && <ScopeOverlay gs={gs} c={c} run={run} />}
      {gs.phase === "report" && <ReportOverlay gs={gs} c={c} run={run} />}
      {(gs.phase === "won" || gs.phase === "caught") && <ResultOverlay gs={gs} c={c} caseId={caseId}
        onRetry={() => { savedRef.current = false; setGs(E.createGame(content, caseId, effDiff(caseId, profile.difficulty))); }}
        onHub={onExit} onNext={onNext} onCodex={onCodex} />}
    </div>
  );
}

function Inspector({ node, gs, c, run }:
  { node: any; gs: GameState; c: Case; run: (fn: any) => void; setGs: any }) {
  if (!node) return <div className="card"><Title>УЗЕЛ</Title>
    <div style={{ padding: 18, color: "var(--mut)", fontSize: 13, lineHeight: 1.7 }}>
      Выбери узел на карте.<br /><br />▢ машина · ☺ человек (чат) · ◎ цель · <span style={{ color: "var(--red)" }}>┈ вне scope</span>.
    </div></div>;
  const rt = gs.nodes[node.id];
  const oos = !node.inScope;
  const isPerson = node.kind === "person";
  return (
    <div className="card">
      <Title dot={oos ? "var(--red)" : "var(--teal)"}>УЗЕЛ // {node.id}</Title>
      <div style={{ padding: 14 }}>
        <div className="row"><span style={{ fontSize: 22, color: node.kind === "target" ? "var(--amber)" : "var(--teal)" }}>{isPerson ? "☺" : node.kind === "target" ? "◎" : "▢"}</span>
          <div><div style={{ fontWeight: 700 }}>{node.label}</div><div className="mono" style={{ fontSize: 11, color: oos ? "var(--red)" : "var(--mut)" }}>{oos ? "вне договора" : isPerson ? "человек" : "машина"}{node.lock ? " · двойной замок" : ""}</div></div>
        </div>

        {oos && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--red)", lineHeight: 1.5 }}>Заказчик это трогать не разрешал. Полезть — выбор с последствиями.</div>}

        {!oos && node.lock && (
          <div style={{ marginTop: 12 }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--mut)", marginBottom: 6 }}>ДВОЙНОЙ ЗАМОК</div>
            {node.lock.sockets.map((s: any) => {
              const filled = gs.sockets[node.id]?.[s.id];
              const key = s.accepts.replace(/^key:/, "");
              return <button key={s.id} className="btn sm" style={{ width: "100%", marginBottom: 6, borderColor: filled ? "var(--grass)" : "var(--line)", color: filled ? "var(--green)" : "var(--white)" }}
                disabled={filled || gs.phase !== "playing"} onClick={() => run((ct: any, st: any) => E.fillSocket(ct, st, node.id, s.id))}>
                {filled ? "✓ " : "🔑 "} {s.label}{!filled && !gs.keys[key] ? " (нет ключа)" : ""}</button>;
            })}
          </div>
        )}

        {!oos && !rt.compromised && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
            {!isPerson && !node.lock && <button className="btn" disabled={gs.phase !== "playing" || rt.scanned} onClick={() => run((ct: any, s: any) => E.scan(ct, s, node.id))}>🔍 Осмотреть (скан){rt.scanned ? " · готово" : ""}</button>}
            {isPerson && <button className="btn amber" disabled={gs.phase !== "playing"} onClick={() => run((ct: any, s: any) => E.openChat(ct, s, node.npc))}>💬 Поговорить</button>}
            {!isPerson && !node.lock && rt.scanned && (
              <div>
                <div className="mono" style={{ fontSize: 10, color: "var(--mut)", margin: "6px 0 6px" }}>ГИПОТЕЗА — какая слабость?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {candidateVulns(node).map((v) => (
                    <button key={v} className="btn sm" disabled={gs.phase !== "playing"} onClick={() => run((ct: any, s: any) => E.hypothesize(ct, s, node.id, v))}>{v}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {rt.compromised && <div style={{ marginTop: 12, color: "var(--green)", fontSize: 12.5 }}>Узел под контролем. Соседние доступны — ищи путь к цели.</div>}
      </div>
    </div>
  );
}

function PuzzleOverlay({ gs, run }: { gs: GameState; run: (fn: any) => void }) {
  const p = gs.activePuzzle!;
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => p.multi ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]);
  return (
    <div className="overlay"><div className="modal" style={{ maxWidth: 480 }}>
      <Title dot="var(--amber)">ГОЛОВОЛОМКА · {p.title}</Title>
      <div style={{ padding: 20 }}>
        <p style={{ color: "var(--mut)", marginTop: 0 }}>{p.prompt}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {p.options.map((o) => (
            <button key={o.id} onClick={() => toggle(o.id)} className="mono"
              style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "1px solid " + (sel.includes(o.id) ? "var(--teal)" : "var(--line)"), background: sel.includes(o.id) ? "rgba(79,209,197,.1)" : "var(--panel2)", color: "var(--white)" }}>
              {p.multi ? (sel.includes(o.id) ? "☑ " : "☐ ") : ""}{o.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn solid" disabled={!sel.length} onClick={() => run((ct: any, s: any) => E.submitPuzzle(ct, s, sel))}>Выполнить</button>
          <button className="btn" onClick={() => run((ct: any, s: any) => E.cancelPuzzle(ct, s))}>Отмена</button>
        </div>
      </div>
    </div></div>
  );
}

function ChatOverlay({ gs, c, run }: { gs: GameState; c: Case; run: (fn: any) => void }) {
  const npcId = gs.activeChat!;
  const cfg = content.npcs[npcId];
  const rt = gs.npc[npcId];
  const tones = cfg.tones;
  const toneLabel: Record<string, string> = { friendly: "дружелюбно", business: "деловито", urgent: "срочно", flattery: "с лестью" };
  const lastLine = [...gs.log].reverse().find((l) => l.t.startsWith("[чат"));
  return (
    <div className="overlay"><div className="modal" style={{ maxWidth: 460 }}>
      <Title dot="var(--amber)">ЧАТ · {cfg.role}</Title>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{ fontSize: 24 }}>☺</span>
          <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "4px 12px 12px 12px", padding: "10px 12px", fontSize: 13.5 }}>
            {lastLine ? lastLine.t.replace(/^\[чат[^\]]*\]\s*/, "") : cfg.replies.greeting}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--mut)", margin: "16px 0 6px" }}>ПОДОЗРЕНИЕ: {rt.suspicion}/{cfg.suspicion.fail_at}{rt.locked ? " · закрылся" : rt.yielded ? " · ключ получен" : ""}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--mut)", margin: "4px 0 6px" }}>ВЫБЕРИ ТОН:</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {tones.map((t) => (
            <button key={t} className="btn sm" disabled={rt.locked || rt.yielded || gs.phase !== "playing"} onClick={() => run((ct: any, s: any) => E.present(ct, s, npcId, t, []))}>{toneLabel[t] ?? t}</button>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => run((ct: any, s: any) => E.closeChat(ct, s))}>закрыть</button>
      </div>
    </div></div>
  );
}

function ScopeOverlay({ gs, c, run }: { gs: GameState; c: Case; run: (fn: any) => void }) {
  const node = c.nodes.find((n) => n.id === gs.pendingScope)!;
  const cons = c.scope.consequence ? content.consequences[c.scope.consequence] : null;
  return (
    <div className="overlay"><div className="modal" style={{ maxWidth: 480, borderColor: "var(--red)" }}>
      <div style={{ padding: 24 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--red)" }}>// SCOPE — РАМКА ДОГОВОРА</div>
        <h2 style={{ margin: "8px 0 10px", fontSize: 22 }}>«{node.label}» — вне задания</h2>
        {cons && <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6 }}>
          <b style={{ color: "var(--red)" }}>{cons.title}:</b>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{cons.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>}
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn solid" onClick={() => run((ct: any, s: any) => E.confirmScope(ct, s, false))}>Отступить (правильно)</button>
          <button className="btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => run((ct: any, s: any) => E.confirmScope(ct, s, true))}>Всё равно полезть</button>
        </div>
      </div>
    </div></div>
  );
}

function ReportOverlay({ gs, c, run }: { gs: GameState; c: Case; run: (fn: any) => void }) {
  return (
    <div className="overlay"><div className="modal">
      <Title dot="var(--teal)">ОТЧЁТ ЗАКАЗЧИКУ</Title>
      <div style={{ padding: 20 }}>
        <p style={{ color: "var(--mut)", marginTop: 0 }}>Цель достигнута. Для каждой найденной слабости выбери верную меру защиты — это закрывает кейс.</p>
        {c.report.findings.map((f) => {
          const answered = f.id in gs.report;
          const ok = gs.report[f.id];
          return (
            <div key={f.id} style={{ marginBottom: 16, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel2)" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>{f.vuln}</div>
              <div style={{ fontSize: 13, margin: "4px 0 8px", color: "var(--mut)" }}>{f.explanation}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {f.options.map((o) => (
                  <button key={o.id} disabled={answered && ok} onClick={() => run((ct: any, s: any) => E.answerReport(ct, s, f.id, o.id))}
                    style={{ textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--white)", fontSize: 12.5 }}>{o.text}</button>
                ))}
              </div>
              {answered && <div style={{ fontSize: 12, marginTop: 6, color: ok ? "var(--green)" : "var(--red)" }}>{ok ? "✓ верно" : "✗ не та мера — попробуй ещё"}</div>}
            </div>
          );
        })}
      </div>
    </div></div>
  );
}

function ResultOverlay({ gs, c, caseId, onRetry, onHub, onNext, onCodex }:
  { gs: GameState; c: Case; caseId: string; onRetry: () => void; onHub: () => void; onNext: () => void; onCodex: () => void }) {
  const win = gs.phase === "won";
  const isLast = CASE_ORDER.indexOf(caseId) >= CASE_ORDER.length - 1;
  return (
    <div className="overlay"><div className="modal" style={{ maxWidth: 480, borderColor: win ? "var(--grass)" : "var(--red)", textAlign: "center" }}>
      <div style={{ padding: 26 }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: "var(--mut)" }}>{c.title}</div>
        <h2 style={{ margin: "10px 0 6px", fontSize: 30, color: win ? "var(--green)" : "var(--red)" }}>{win ? "ДОСТУП ПОЛУЧЕН" : "ТЕБЯ ЗАСЕКЛИ"}</h2>
        {win ? <>
          <p style={{ color: "var(--mut)", fontSize: 13.5, lineHeight: 1.6 }}>Цель взята за {gs.tick} ход, тревога max {gs.maxAlarm}%. Отчёт сдан.</p>
          <div style={{ fontSize: 15, margin: "10px 0" }}>Ранг: <b style={{ color: "var(--gold)" }}>{gs.rank}</b> · стиль: <b>{E.profileStyle(gs)}</b></div>
          <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button className="btn" onClick={onCodex}>📘 Кодекс</button>
            {!isLast ? <button className="btn solid" onClick={onNext}>следующий кейс →</button> : <button className="btn solid" onClick={onHub}>срез пройден ✓</button>}
            <button className="btn" onClick={onHub}>к заданиям</button>
          </div>
        </> : <>
          <p style={{ color: "var(--mut)", fontSize: 13.5, lineHeight: 1.6 }}>Тревога дошла до предела. Действуй тише: меньше сканов, больше разведки через людей, пережидай пики.</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button className="btn solid" onClick={onRetry}>↻ заново</button>
            <button className="btn" onClick={onHub}>к заданиям</button>
          </div>
        </>}
      </div>
    </div></div>
  );
}

function BriefOverlay({ c, onStart, onExit }: { c: Case; onStart: () => void; onExit: () => void }) {
  return (
    <div className="overlay"><div className="modal" style={{ maxWidth: 540 }}>
      <Title dot="var(--teal)">БРИФ</Title>
      <div style={{ padding: "22px 24px" }}>
        <h2 style={{ marginBottom: 4 }}>{c.title}</h2>
        <div className="mono" style={{ fontSize: 12, color: "var(--teal)", marginBottom: 14 }}>заказчик: {c.brief.client}</div>
        <p style={{ color: "var(--mut)", lineHeight: 1.6 }}>{c.brief.text}</p>
        <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", fontSize: 13 }}>
          <b style={{ color: "var(--teal)" }}>Scope:</b> {c.scope.text}
          {c.scope.rules && <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--mut)" }}>{c.scope.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn solid" onClick={onStart}>начать →</button>
          <button className="btn" onClick={onExit}>назад</button>
        </div>
      </div>
    </div></div>
  );
}

function CodexModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const ids = Object.keys(content.codex).sort();
  const [sel, setSel] = useState<string>(ids.find((i) => profile.codex[i]) ?? ids[0]);
  const card = content.codex[sel];
  const known = !!profile.codex[sel];
  return (
    <div className="overlay"><div className="modal" style={{ maxWidth: 820, display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 20 }}>📘</span><h2 style={{ fontSize: 20 }}>Кодекс</h2>
        <span style={{ color: "var(--mut)", fontSize: 13 }}>реальные знания за вымышленными слабостями</span>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={onClose}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", minHeight: 0 }}>
        <div className="scroll" style={{ borderRight: "1px solid var(--line)", overflowY: "auto", padding: 10, maxHeight: "70vh" }}>
          {ids.map((id) => {
            const kn = !!profile.codex[id]; const on = id === sel;
            return <button key={id} onClick={() => setSel(id)} style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, marginBottom: 4, border: "1px solid " + (on ? "var(--teal)" : "transparent"), background: on ? "rgba(79,209,197,.08)" : "transparent" }}>
              <div className="mono" style={{ fontSize: 12, color: kn ? "var(--teal)" : "var(--dim)" }}>{id} {kn ? "" : "🔒"}</div>
            </button>;
          })}
        </div>
        <div className="scroll" style={{ overflowY: "auto", padding: "18px 20px", maxHeight: "70vh" }}>
          {known ? <>
            <div className="mono" style={{ fontSize: 12, color: "var(--amber)" }}>{card.id}</div>
            <h3 style={{ fontSize: 20, margin: "6px 0 14px" }}>{card.realTerm}</h3>
            <Field t="Почему работает">{card.whyItWorks}</Field>
            <Field t="Как защищаются" c="var(--teal)">{card.defense}</Field>
            <Field t="Реальный случай">{card.realCase}</Field>
            <Field t="Копнуть глубже" c="var(--grass)">{card.learnMore.map((l) => l.title).join(" · ")}</Field>
            <div style={{ marginTop: 14, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel2)", fontSize: 12.5, color: "var(--mut)" }}>
              <b style={{ color: "var(--white)" }}>Закон.</b> {card.law}
            </div>
          </> : <div style={{ color: "var(--mut)", textAlign: "center", marginTop: 30 }}>🔒 Откроется, когда вскроешь эту слабость в деле.</div>}
        </div>
      </div>
    </div></div>
  );
}

function Field({ t, c, children }: { t: string; c?: string; children: ReactNode }) {
  return <div style={{ marginBottom: 14 }}>
    <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: c ?? "var(--mut)", marginBottom: 4 }}>{t.toUpperCase()}</div>
    <div style={{ fontSize: 14, lineHeight: 1.55 }}>{children}</div>
  </div>;
}
