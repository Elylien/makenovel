# Native stage exit lifetime tests

Run `node integrations/stage-exit-tests/run-tests.mjs` from the root.

Nine tests execute production `syncPixiStageState`, the exit registry and
`stopAllPerform`. Pixi objects, timers and animation construction are controlled
boundaries. Tests cover background/figure removal, normal completion, load/stop
cancellation, stale callbacks, same-millisecond exits, object replacement and
instant skip. They check native wiring as well as the registry; they do not render
GPU frames or claim failed asset loads are transactional.

With the round-five native sync implementation injected by the runner's optional
`ORIGINAL_SYNC_FILE` test setting, six cases failed. The reviewed sync + registry
passes nine. The ordinary runner always bundles current production source.

Separate runtime restore tests verify the save gate rejects a pending exit even
when the ordinary perform list is empty. An exit is a temporary render object;
it does not become part of the serialized player state.
