import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const core = require('@pixi/core');
const { settings } = require('@pixi/settings');
const h = { core, Assets: { loader: { parsers: [] } }, images: [], textures: [] };
globalThis.__svgHarness = h;
globalThis.document = { baseURI: 'http://localhost/game/', createElement: () => ({ href: '' }) };
globalThis.location = new URL('http://localhost/');
class ImageBoundary {
  constructor() { this.complete = false; this.width = 0; this.height = 0; h.images.push(this); }
}
globalThis.Image = ImageBoundary;
globalThis.HTMLImageElement = ImageBoundary;
settings.ADAPTER = { ...settings.ADAPTER, createCanvas: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
const { Assets } = await import(pathToFileURL(process.env.SVG_PARSER_TEST_BUNDLE));
const parser = Assets.loader.parsers[0]; // The actual production parser registered by assetParsers.ts.
const nativeFrom = core.Texture.from;
const deferred = () => {
  let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let count = 0; count < 16; count++) await Promise.resolve(); };
function observe(promise) {
  const result = { state: 'pending' };
  promise.then(value => Object.assign(result, { state: 'resolved', value }), error => Object.assign(result, { state: 'rejected', error }));
  return result;
}
function makeTexture(kind = 'svg') {
  const resource = kind === 'svg'
    ? new core.SVGResource(`fixture-${h.sequence++}.svg`, { autoLoad: false, crossorigin: false })
    : new core.ImageResource(new ImageBoundary(), { autoLoad: false, createBitmap: false });
  resource.internal = true;
  const baseTexture = new core.BaseTexture(resource);
  const texture = new core.Texture(baseTexture);
  h.textures.push(texture);
  return { texture, baseTexture, resource };
}
function load(fixture, extension = 'svg') {
  core.Texture.from = (url, options) => {
    assert.equal(options.resourceOptions.autoLoad, false);
    return fixture.texture;
  };
  return parser.load(`http://localhost/game/fixture-${h.sequence++}.${extension}`, { data: { webgalKind: 'texture' } });
}
beforeEach(() => { h.images = []; h.textures = []; h.sequence = 0; });
afterEach(() => {
  core.Texture.from = nativeFrom;
  for (const texture of h.textures) if (texture.baseTexture) texture.destroy(true);
});

test('actual Pixi SVGResource onError rejects production parser although native load never settles', async () => {
  const fixture = makeTexture(); const result = observe(load(fixture));
  const nativeResult = observe(fixture.resource.load());
  const error = new Error('image decode failed'); error.detail = { url: 'broken.svg' };
  assert.equal(typeof h.images[0].onerror, 'function');
  h.images[0].onerror(error); await flush();
  assert.equal(nativeResult.state, 'pending'); // Reproduce the locked Pixi defect, not a replacement loader.
  assert.equal(result.state, 'rejected'); assert.equal(result.error, error);
  assert.equal(fixture.texture.baseTexture, null); assert.equal(fixture.resource.destroyed, true);
  assert.equal(fixture.baseTexture.listenerCount('error'), 0);
});

test('actual SVG onload resolves and removes only its temporary error subscription', async () => {
  const fixture = makeTexture(); const existing = () => {};
  fixture.baseTexture.on('error', existing);
  const result = observe(load(fixture));
  assert.equal(fixture.baseTexture.listenerCount('error'), 2);
  Object.assign(h.images[0], { width: 32, height: 24 }); h.images[0].onload(); await flush();
  assert.equal(result.state, 'resolved'); assert.equal(result.value, fixture.texture);
  assert.equal(fixture.baseTexture.listenerCount('error'), 1);
  assert.equal(fixture.baseTexture.listeners('error')[0], existing);
  assert.equal(fixture.resource.destroyed, false);
});

test('SVG synchronous load exception preserves the original error and cleans subscription before destruction', async () => {
  const fixture = makeTexture(); const error = new TypeError('sync SVG load failure');
  fixture.resource.load = () => { throw error; };
  const result = observe(load(fixture)); await flush();
  assert.equal(result.state, 'rejected'); assert.equal(result.error, error);
  assert.equal(fixture.baseTexture.listenerCount('error'), 0); assert.equal(fixture.texture.baseTexture, null);
});

test('SVG native load rejection preserves the original error and clears temporary listener', async () => {
  const fixture = makeTexture(); const wait = deferred(); const error = new RangeError('native promise rejection');
  fixture.resource.load = () => wait.promise; const result = observe(load(fixture));
  assert.equal(fixture.baseTexture.listenerCount('error'), 1);
  wait.reject(error); await flush(); assert.equal(result.state, 'rejected'); assert.equal(result.error, error);
  assert.equal(fixture.baseTexture.listenerCount('error'), 0); assert.equal(fixture.resource.destroyed, true);
});

test('SVG synchronous error event during load is caught and a later native rejection is consumed', async () => {
  const fixture = makeTexture(); const wait = deferred(); const event = { type: 'error', marker: 'original event object' };
  fixture.resource.load = () => { fixture.resource.onError.emit(event); return wait.promise; };
  const result = observe(load(fixture)); await flush(); assert.equal(result.state, 'rejected'); assert.equal(result.error, event);
  wait.reject(Error('late native rejection')); await flush();
  assert.equal(result.error, event); assert.equal(fixture.baseTexture.listenerCount('error'), 0);
});

test('failed SVG subscription cannot reject an independent concurrently loading SVG', async () => {
  const first = makeTexture(), second = makeTexture();
  const firstResult = observe(load(first)), secondResult = observe(load(second));
  const error = new Error('first SVG only'); h.images[0].onerror(error); await flush();
  assert.equal(firstResult.state, 'rejected'); assert.equal(secondResult.state, 'pending');
  assert.equal(second.baseTexture.listenerCount('error'), 1);
  Object.assign(h.images[1], { width: 64, height: 64 }); h.images[1].onload(); await flush();
  assert.equal(secondResult.state, 'resolved'); assert.equal(secondResult.value, second.texture);
  assert.equal(second.baseTexture.listenerCount('error'), 0);
});

test('non-SVG ImageResource still rejects through its own native onerror without a bridge subscription', async () => {
  const fixture = makeTexture('png'); fixture.resource.source.src = 'broken.png';
  const result = observe(load(fixture, 'png')); assert.equal(fixture.baseTexture.listenerCount('error'), 0);
  const error = new Error('PNG native failure'); fixture.resource.source.onerror(error); await flush();
  assert.equal(result.state, 'rejected'); assert.equal(result.error, error); assert.equal(fixture.texture.baseTexture, null);
});

test('non-SVG ImageResource success remains unchanged without an SVG listener', async () => {
  const fixture = makeTexture('png'); fixture.resource.source.src = 'ready.png';
  const result = observe(load(fixture, 'png')); assert.equal(fixture.baseTexture.listenerCount('error'), 0);
  Object.assign(fixture.resource.source, { width: 64, height: 32 }); fixture.resource.source.onload(); await flush();
  assert.equal(result.state, 'resolved'); assert.equal(result.value, fixture.texture); assert.equal(fixture.resource.destroyed, false);
});

test('SVG matching is based on the actual native resource even for an uppercase extension and query string', async () => {
  const fixture = makeTexture(); const error = { type: 'error', marker: 'SVG with query' };
  const result = observe(load(fixture, 'SVG?revision=2'));
  h.images[0].onerror(error); await flush(); assert.equal(result.state, 'rejected'); assert.equal(result.error, error);
  assert.equal(fixture.baseTexture.listenerCount('error'), 0);
});

test('same URL after SVG failure creates a fresh resource through real Texture.from caches', async () => {
  core.Texture.from = nativeFrom;
  const { TextureCache, BaseTextureCache } = require('@pixi/utils');
  const url = 'http://localhost/game/retry.svg';
  const firstResult = observe(parser.load(url, { data: { webgalKind: 'texture' } }));
  const first = TextureCache[url]; const firstResource = first.baseTexture.resource; h.textures.push(first);
  assert.ok(firstResource instanceof core.SVGResource);
  h.images[0].onerror(new Error('first decode failed')); await flush();
  assert.equal(firstResult.state, 'rejected'); assert.equal(TextureCache[url], undefined); assert.equal(BaseTextureCache[url], undefined);
  const secondResult = observe(parser.load(url, { data: { webgalKind: 'texture' } }));
  const second = TextureCache[url]; h.textures.push(second);
  assert.notEqual(second, first); assert.notEqual(second.baseTexture.resource, firstResource);
  Object.assign(h.images[1], { width: 64, height: 48 }); h.images[1].onload(); await flush();
  assert.equal(secondResult.state, 'resolved'); assert.equal(secondResult.value, second);
  assert.equal(firstResource.destroyed, true); assert.equal(second.baseTexture.listenerCount('error'), 0);
});
