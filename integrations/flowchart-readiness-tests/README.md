# Flowchart readiness regression

Run `node integrations/flowchart-readiness-tests/run-tests.mjs` from the repository root.

This suite composes the actual FlowchartManager, SceneManager, StageStateManager, PerformController, PixiController image mounting, exit cleanup, and explicit-save gates. It covers a single dialogue with no later script commit, finite completion, pending/failing/replaced images, exits, scene locks, duplicate notifications, and canceled scene/session/storage scopes. Pixi containers and texture loading, persistence, compatibility validation and continuation are test boundaries; it does not prove rendered motion, audio quality or Windows operation.
