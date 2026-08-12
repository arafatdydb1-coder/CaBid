# Decisions

Everything in the build prompt was followed exactly. These notes record the small
choices made where the spec left room, plus the two additions required to make the
timing spec actually render correctly.

## Additions to the constant set (spec said "tunable numbers live here")

- **`PIN_TICK_MS = 100`** — while a pin is active the server re-broadcasts
  `stateUpdate` every 100ms so the progress ring animates. This is required because
  during a 3-second hold neither player sends `press`/`release`, so no state change
  would otherwise occur to push `pinProgressMs` to the clients. The server still
  computes `pinProgressMs` from its own clock; this is purely a renderer heartbeat.

## Places where the spec left something open

- **`stateUpdate` after `pinBroken` and `pointScored`.** The spec names only the
  headline event for these moments. A `stateUpdate` is also broadcast so both clients
  re-render the reset hands/pin-state exactly from the server (the clients never infer
  it themselves).
- **`matchOver` carries the final scores** (`matchOver { winner, scores }`). Because
  the final point emits `matchOver` *instead of* `pointScored` (literal reading of the
  spec), the winning score would otherwise never reach the clients — the match-over
  screen would show the pre-final-point snapshot. Adding `scores` keeps the server the
  source of truth for scores with no extra event.
- **Final point emits `matchOver` instead of `pointScored`** (literal reading of
  "broadcast `matchOver` instead"). The match-over screen shows final scores from the
  client's last `stateUpdate` snapshot.
- **`rematch` reset flow.** `rematch` resets the room via the same `resetMatch()` used
  on game start, then re-broadcasts `gameStart` — the only event in the contract that
  returns both clients to the game screen. The first `rematch` to arrive wins; the
  second is ignored (idempotent).
- **Reconnect.** The client auto-rejoins its room on socket reconnect by re-emitting
  `joinRoom` with its stored code. The server reassigns the previously-disconnected
  role. A room survives `ROOM_CLEANUP_GRACE_MS` (30s) after a disconnect, then is
  deleted from the registry if the room is no longer fully connected.
- **Joining a finished room** resets the match (same `resetMatch()`) so a fresh player
  can take over. Refusing felt worse than restarting.
- **Leaving via "Home"** closes and immediately reopens the socket connection
  (client-side `socket.disconnect(true)` + `connect()`), which triggers the server's
  disconnect handling. No extra wire event was invented.
- **`opponentLeft` UX:** the remaining player is returned to the lobby to wait for a
  possible reconnect; a toast explains why.
- **No optimistic local rendering.** The client's own hand/ring always reflect server
  broadcasts (including a ~1-RTT delay on your own press) so both devices always show
  the identical, fair picture. The progress bar is scaled client-side with
  `pinProgressMs / 3000` — a pure render math mirror of `PIN_DURATION_MS`, never a
  client decision about scoring.
- **Touch inputs** use `pointerdown`/`pointerup`/`pointercancel` plus
  `setPointerCapture`, with `touch-action: manipulation`, `user-select: none`, and a
  `contextmenu` preventDefault, per Section 8.

## Explicitly not implemented

- No "rising hand attacks opponent" logic. Escaping a pin only frees the trapped
  player; it never scores and never stuns. The only way to score is the 3-second
  uninterrupted pin (see Section 4 of the build prompt).
