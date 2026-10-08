# Native audio lifecycle regression tests

Run from the repository root:

```powershell
node integrations/audio-lifecycle-tests/run-tests.mjs
```

This runner bundles the production `vocal/index.ts`, `vocalAnimation.ts`, media-source helper, `playEffect.ts` and `AudioContainer.tsx` with the locked WebGAL esbuild. It executes their behavior with controlled media elements, AudioContext, timers, stage/store, a minimal perform boundary and React hook/effect lifecycle. It does not duplicate the audio production implementation.

Round 6 verification on 2026-10-08: **23/23 passed**. Before the fixes, the first 13 voice/SE cases had **4 passes / 9 failures**. After the voice/SE changes and before the container changes, 22 cases had **17 passes / 5 failures**; the container failures included a real unhandled playback rejection. One additional case checks a restore/replacement with identical BGM values.

Coverage includes cancellation before deferred playback and while AudioContext resumes; stale rejection/error/ended callbacks; captured DOM ownership; replay of an earlier DOM element with its existing WebAudio source; audio setup failure; ordinary and looping SE rejection; idempotent cleanup; terminal mouth/eye state; fade completion and muted fade-out; stale or unmounted fade callbacks; identical BGM replacement; UI sound completion/error/rejection/unmount; and preserving BGM/current voice when a menu opens.

These tests prove controller-side resource ownership and effect cleanup at mocked browser boundaries. They do not prove a particular browser's codec support, actual sound output, device volume, autoplay activation behavior, React paint timing, long sound files, or packaged EXE audio. Voice startup still uses the upstream 1 ms delay to allow the React audio element to render; an explicit element-ready handshake remains future work. Menu opening preserves native audio playback; the separate gameplay tests cover suspension of script progression. No commercial reference-game audio is used.
