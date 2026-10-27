# Local author tools

The CLI exposes the existing Terre author workspace to an AI or another local caller. It queries projects, command capabilities, source identities and asset metadata; prepares a bounded source proposal; reviews and validates it; and commits through Terre's existing `saveTextSnapshot` transaction. It does not call a model, host a chat, execute scenes or implement another script format.

Run from the MakeNovel root with the locked vendor dependencies installed and the controlled editor running:

```powershell
node integrations/author-tools/cli.mjs capabilities
node integrations/author-tools/cli.mjs commands
node integrations/author-tools/cli.mjs projects
node integrations/author-tools/cli.mjs assets --game my-game --category figure
node integrations/author-tools/cli.mjs source --game my-game --path game/scene/start.txt
node integrations/author-tools/cli.mjs diagnose --file .local/author-proposals/draft.txt
node integrations/author-tools/cli.mjs propose --game my-game --path game/scene/start.txt --operations .local/author-proposals/operations.json --out .local/author-proposals/proposal.json
node integrations/author-tools/cli.mjs review --proposal .local/author-proposals/proposal.json
node integrations/author-tools/cli.mjs validate --proposal .local/author-proposals/proposal.json
node integrations/author-tools/cli.mjs commit --proposal .local/author-proposals/proposal.json --review-hash '<digest from the reviewed proposal>'
```

Replace `my-game`, file paths and the digest with observed values. The local artifact directory must already exist. `propose` refuses to overwrite an existing output file; it does not write the scene. `validate` is read-only: inspect its `valid` field and diagnostics rather than treating successful command completion as content approval. `commit` requires the exact reviewed digest, replays the declared operations, rereads source/workspace and asset metadata, then supplies `expectedRevision` and `expectedWorkspaceId` to the original server. A successful receipt has `committed: true` and `requiresReseal: true`.

The default server is `http://127.0.0.1:3001`. Network commands accept `--origin http://127.0.0.1:<port>`; proposal metadata never silently chooses the destination. Remote hosts, credentials and redirects are refused. JSON results go to stdout, structured errors to stderr with exit code 1. No API keys or model accounts are needed.

Operations are a JSON array:

```json
[
  { "type": "patchDialogue", "nodeId": "observed.dialogue.id", "text": "雨停以后，我们再读一页。" },
  { "type": "insertBefore", "beforeNodeId": "observed.next.id", "statement": "say:这一句来自可审阅提案 -speaker=林;" }
]
```

IDs must come from `source`, not guessed text or line numbers. A separate `{ "type": "registerIds" }` proposal can register missing identities on known editable commands. Re-read after committing it. New insertions receive fresh IDs; unknown advanced neighbors remain byte-identical. The current insert set is `say`, `changeBg`, `changeFigure`, `bgm`, `playEffect`, `wait`, `end`, `label`, `jumpLabel`, and `setVar`. New scenes, route simulation, multi-file transactions, recursive resource catalogs and model/MCP transports remain outside this implementation.

The real locked parser, native scene analysis and source-local identity/edit helpers are loaded through `load-native.mjs`; generated bundles stay under `.scratch/`. Source changes preserve BOM, line endings, comments and unrelated bytes through those shared helpers. Asset checks establish top-level catalog existence, not successful decoding, playback or route execution. Work still needs native preview and explicit resealing after author edits.

`author-tools.test.mjs` runs production parsing/identity/proposal logic with a deterministic HTTP transport substitute. It checks preservation, stale and racing writes, review integrity, workspace/path boundaries, resource failures and unchanged source on refusal. `cli.test.mjs` runs real CLI child processes and sends real HTTP requests to a temporary protocol fixture, checking exclusive artifact output, local review and guarded commit/replay. Neither suite exercises a real Terre server, GUI, system IME, Windows package or full product acceptance. Root orchestration runs the actual service and author handoff separately. Usage and recovery details: [AI authoring guide](../../docs/AI_AUTHORING.md).
