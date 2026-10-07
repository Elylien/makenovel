# Project entry

Read `docs/PROJECT_STATUS.md`, `docs/HANDOFF.md`, and `docs/DEVELOPMENT_PLAN.md` first. On resume, verify Git status, submodule commits, and live processes before relying on previous results.

- Windows commands use PowerShell 7 (`pwsh`), `-NoLogo -NoProfile` for nested shells, literal paths and explicit working directories. Check native exit codes; use `npm.cmd` / `npx.cmd` if wrappers fail. New files are UTF-8; preserve source line endings. Never use Bash syntax in PowerShell.
- Original user documents, when available, are under `docs/private/`. Never stage or upload them, even with `git add -f`. Public requirements and acceptance state live in `docs/REQUIREMENTS_TRACEABILITY.md`.
- Reuse the locked WebGAL runtime and Terre editor. Do not replace native scripts, runtime or save state with an independent implementation. `experiments/` is evidence, not completed product functionality.
- Do not modify vendor sources without a reviewed, reproducible patch strategy. Preserve upstream copyrights, lockfiles, original assets and user changes. Inspect submodule status as well as root status.
- Unknown syntax and comments must survive local edits. Stable identity is distinct from line number/text revision. Reject stale writes; incomplete drafts must not reach the active runtime.
- The reference is the Steam Chinese Windows edition of Senren Banka. Build and patch details remain unverified. No copying commercial assets.
- Build/test commands and evidence are in `docs/TESTING.md`. Record passed, failed, not run, blocked and human review separately. A successful web build is not Windows offline acceptance.
- Update status and handoff before stopping, including process state, last tests, unfinished work and next concrete command. Public repo creation was authorized; paid services and formal software releases are separate actions.
