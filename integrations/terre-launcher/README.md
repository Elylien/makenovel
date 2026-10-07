# Isolated local Terre launcher

Run from the MakeNovel repository after applying its Terre patches and building both Terre workspaces:

```powershell
pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Background
```

Open the printed `http://127.0.0.1:3001` URL. `-Port 3011` selects another free port. Omitting `-Background` keeps the command attached until the editor exits. The launcher never opens the default browser and does not start the upstream Vite development server or port-80 proxy.

```powershell
node.exe integrations/terre-launcher/verify-editor.mjs
pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Stop
```

The stop command checks the saved PID, start time, executable name, and backend entry path before stopping the process. It does not stop unrelated Node processes. The launcher refuses an occupied port and an unpatched backend build.

## Data and process boundaries

- Only the child receives `WEBGAL_USER_DATA_ROOT`, `WEBGAL_EDITOR_DIST`, `WEBGAL_PORT`, and `WEBGAL_OPEN_BROWSER=0`. Shell and global settings remain unchanged.
- Profile configuration, games, user templates, derivative engines and exports live in `.local/editor-profile/`. Existing user `~/.webgal_terre` is not read or created by this mode.
- In isolated mode, any old custom path in the profile config and any portable-data directory are ignored. Changing the data root, legacy migration, and portable mode are refused. This prevents the settings UI from silently leaving the test profile.
- PID and stdout/stderr logs live in `.local/editor-runtime/`. The upstream logger additionally writes to the ignored `vendor/WebGAL_Terre/packages/terre2/logs/` directory. Runtime templates remain in the locked backend checkout; this is profile isolation, not a filesystem sandbox for trusted local code or assets.
- The launcher invokes `packages/terre2/dist/src/main.js` with the backend package as its working directory. `WEBGAL_EDITOR_DIST` serves the existing `packages/origine2/dist` before the upstream logical-static controller; game/template routes continue to use that controller and profile-aware paths.

## HTTP and WebSocket policy

The Nest HTTP server listens only on `127.0.0.1` and validates its exact `Host` header. Origin, when supplied, must equal the printed URL. Referer, when supplied, must have that exact origin. Cross-site and same-site (different-origin) Fetch Metadata are refused. Every `/api` request requires either that Origin or Referer, including GET endpoints because some upstream GET routes launch local programs or write exports. Static top-level navigation can omit a source. CORS also permits only the printed origin; it is additional to server-side request rejection.

Both preview `/api/webgalsync` and language-server `/api/lsp2` WebSockets use the same HTTP listener, with the same source checks before upgrading. The adapter refuses independent WebSocket listeners. The launcher checks that its child has exactly one listener at the selected loopback address and port.

Command-line API probes must include `Origin: http://127.0.0.1:3001`. PowerShell probes also use `-NoProxy`, so a configured system proxy cannot intercept loopback health checks. `localhost` and another local port are intentionally distinct origins; the upstream split-port development workflow is not this launcher’s supported entry point. Use the built frontend.

Local processes can supply request headers themselves. These checks prevent external web pages from driving the filesystem API through the browser; they do not authenticate other local processes or sandbox scripts deliberately loaded into the editor origin. Windows offline author/player packaging remains separate work.

## Verification

`verify-editor.mjs` checks the actual running build: built UI and profile response, valid origin/referer, rejection of missing/foreign/null/deceptive/different-port sources and foreign Host, rejection of cross-site Fetch Metadata, blocked POSTs to a real create-folder route without filesystem output, and allowed/refused WebSocket upgrades on both gateway paths. The three added profile unit tests check that the home lookup is unused, custom/portable roots cannot override isolation, migrations cannot leave the profile, and relative profile roots fail.
