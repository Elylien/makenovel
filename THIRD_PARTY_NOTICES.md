# Third-party components

MakeNovel integration code is licensed under MPL-2.0. Each third-party component retains its own license and copyright.

| Component | Pinned source | License evidence |
| --- | --- | --- |
| WebGAL 4.6.5 | `vendor/WebGAL`, commit in `upstream.lock.json` | Upstream `LICENSE`, package manifests |
| WebGAL Terre 4.6.5 | `vendor/WebGAL_Terre`, commit in `upstream.lock.json` | Upstream `LICENSE`, package manifests |

Both top-level source repositories declare MPL-2.0. Their dependency trees, fonts, demo images, audio and optional model runtimes require separate review for any distributed binary or game. A source repository license is not a blanket asset license.

The Git submodules retain original sources and notices and link to the official repositories. No compiled upstream player, editor, demo asset bundle or Windows executable is published by this preparation commit. When patched binaries are distributed, record the exact sources, modifications, license notices and source access instructions for that artifact.

Pre-release checklist: inventory the resolved dependency and asset versions, preserve required notices, identify any separately licensed optional components, replace unapproved demonstration assets, and review the actual distribution package. This preparation record does not certify all dependencies or assets for release.

References: [WebGAL](https://github.com/OpenWebGAL/WebGAL), [Terre](https://github.com/OpenWebGAL/WebGAL_Terre), [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
