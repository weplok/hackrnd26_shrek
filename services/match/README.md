# @zero-day/match — real-time Red vs Blue duel

Authoritative WebSocket server for the duel mode. One shared `DuelState` per room,
10 Hz tick loop, each side gets its own projection (fog of war).

- **Red** reuses the campaign engine (`@zero-day/engine`) unchanged: scans, puzzles,
  social engineering. Red actions drop footprints on nodes and raise exposure.
- **Blue** is an arcade patrol (Pac-Man style) moving across the same node graph.
  It eats Red's footprints to fill the detection bar and interrupts an exploit by
  reaching the node Red is solving. `isolate` = power-pellet (node offline 8 s).

Map, positions and edges come straight from the case content (default `L3C1`,
13 nodes). Win: Red compromises the target → Red; detection hits 100 or the round
timer runs out → Blue.

## Run

```
pnpm --filter @zero-day/match start   # ws://localhost:8090  (MATCH_PORT to override)
```

## Protocol (v1, JSON over WS)

Client → server:
- `{ t:'join', room, role:'red'|'blue', nick? }`
- `{ t:'red_cmd', cmd }` — engine `Command` (ScanNode, ProposeHypothesis, SubmitPuzzle, …)
- `{ t:'red_lay_low' }` — burn footprints near the target
- `{ t:'blue_move', node }` — head to an adjacent node
- `{ t:'blue_isolate', node }` — power-pellet isolate

Server → client:
- `{ t:'joined', role, caseId, opponentKind }`
- `{ t:'tick', view }` — `RedView` or `BlueView` (10 Hz)
- `{ t:'events', events }` — engine events for the Red action just applied
- `{ t:'over', winner, reason }`
- `{ t:'error', msg }`

## Not yet (next)

- `content/duel/rules.json` for the balance constants in `match.ts` (`RULES`).
- Lobby / matchmaking (room codes, role pick) — rooms are auto-created on first join.
- AI opponent via MCP to fill an empty side.
- Snake "Quarantine" ability as Blue's second tool.
- `apps/web` duel screens (Red reuses the game UI; Blue canvas patrol).
