import SceneParser, { SCRIPT_CONFIG } from 'webgal-parser';
export { analyzeScene, hasUnreviewedAdvancedChanges } from '../../vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-document/scene-analysis';
export { inspectSceneIdentity, assignMissingNodeIds, patchNodeDialogue, insertSceneStatement } from '../../vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-identity/scene-identity';

const parser = new SceneParser(undefined, (name: string) => name, [], SCRIPT_CONFIG);
export const parseNative = (source: string) => parser.parse(source.replace(/^\uFEFF/, ''), 'author-tools', 'author-tools.txt').sentenceList;
export const nativeCommands = SCRIPT_CONFIG.map(item => ({ name: item.scriptString, command: item.scriptType }))
  .filter(item => item.name !== 'if' && item.name !== 'chooseLabel');
