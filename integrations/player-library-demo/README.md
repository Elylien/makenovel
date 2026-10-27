# Native player library fixture

Generate a new isolated project after the reviewed runtime and shared Terre template are built:

```powershell
npm.cmd run demo:player-library -- --output .local/editor-profile/games/my-player-library
npm.cmd run test:player-library-demo
```

The generator refuses existing output and creates a fresh project ID and Game_key. It reuses original programmatic SVG placeholders, PCM diagnostic tones and native finite animation resources from earlier fixtures; the locked upstream GUI templates retain their license. It does not contain another player.

Normal title entry reaches three native scenes:

1. `start.txt`: one dialogue while static pictures become ready. Stay at R18-READY to inspect the image chapter unlock; save here before collecting later lines.
2. `motion.txt`: one dialogue overlapping an eight-second finite animation. Let it finish without advancing to test event-driven unlock.
3. `library.txt`: text-only, two playable voice tones, intentionally undecodable audio, an intentionally missing stable ID, and a final inspection stop.

Use the native history page to collect lines, filter/search/order, audition, and cancel. Loading the earlier save must preserve collections. Reopen the player to verify persistence. The broken audio must produce an error while retaining its text. Tones are not recorded speech, and media state does not prove listening quality.

The automated generator checks cover native parsing/resource references, one-dialogue structure, BOM/CRLF, identity markers, sealing, refusal to overwrite, and isolated identities. They do not grant GUI, Chinese IME, Windows, performance or full product acceptance. Actual evidence is recorded under `docs/evidence/` by round.
