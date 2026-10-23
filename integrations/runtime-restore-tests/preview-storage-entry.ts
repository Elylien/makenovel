// Keep the compatibility gate, native restore transaction and author command
// dispatch in one bundle so all three observe the same page-scoped latch.
export * from '../../vendor/WebGAL/packages/webgal/src/Core/controller/storage/makenovelCompatibility';
export { loadGame } from '../../vendor/WebGAL/packages/webgal/src/Core/controller/storage/loadGame';
export { SceneManager } from '../../vendor/WebGAL/packages/webgal/src/Core/Modules/scene';
export { startPreviewSyncRuntime } from '../../vendor/WebGAL/packages/webgal/src/Core/util/syncWithEditor/previewSyncRuntime';
export { createRequestEnvelope, createResponseEnvelope } from '../../vendor/WebGAL/packages/webgal/src/types/editorPreviewProtocol';
export { initState } from '../../vendor/WebGAL/packages/webgal/src/Core/Modules/stage/stageStateManager';
