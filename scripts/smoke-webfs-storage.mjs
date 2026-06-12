#!/usr/bin/env node
/** Focused smoke for the isolated browser WebFS storage module. */

import assert from 'node:assert/strict';
import {
  deleteWebFS,
  listWebFS,
  normalizeWebPath,
  readWebFS,
  webfsPath,
  writeWebFS,
} from '../src/lib/webfs/storage.js';
import { createZip } from '../src/lib/webfs/zip.js';

const databases = new Map();

function makeDatabase(state) {
  return {
    objectStoreNames: {
      contains(name) {
        return state.stores.has(name);
      },
    },
    createObjectStore(name) {
      if (!state.stores.has(name)) state.stores.set(name, new Map());
      return {};
    },
    transaction(name) {
      const store = state.stores.get(name);
      if (!store) throw new Error(`missing object store: ${name}`);
      const tx = {
        objectStore() {
          return {
            put(value, key) {
              store.set(key, value);
              queueMicrotask(() => tx.oncomplete?.());
            },
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = store.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            delete(key) {
              store.delete(key);
              queueMicrotask(() => tx.oncomplete?.());
            },
            getAllKeys() {
              const request = {};
              queueMicrotask(() => {
                request.result = [...store.keys()];
                request.onsuccess?.();
              });
              return request;
            },
          };
        },
      };
      return tx;
    },
    close() {},
  };
}

globalThis.indexedDB = {
  open(name) {
    const request = {};
    queueMicrotask(() => {
      let state = databases.get(name);
      const isNew = !state;
      if (!state) {
        state = { stores: new Map() };
        databases.set(name, state);
      }
      request.result = makeDatabase(state);
      if (isNew) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};

assert.equal(normalizeWebPath('/webfs/exports/./demo\\file.js'), 'exports/demo/file.js');
assert.equal(webfsPath('exports/demo/file.js'), '/webfs/exports/demo/file.js');

await writeWebFS('/webfs/exports/demo/demo.js', 'console.log("official");');
await writeWebFS('exports/demo/index.html', '<html></html>');
assert.equal(await readWebFS('exports/demo/demo.js'), 'console.log("official");');
assert.deepEqual(await listWebFS('/webfs/exports/demo'), [
  'exports/demo/demo.js',
  'exports/demo/index.html',
]);
await deleteWebFS('/webfs/exports/demo/demo.js');
assert.equal(await readWebFS('exports/demo/demo.js'), undefined);
assert.deepEqual(await listWebFS('exports/demo'), ['exports/demo/index.html']);

const zip = createZip([
  { name: 'index.html', content: '<html></html>' },
  { name: 'demo.js', content: 'console.log("official");' },
]);
assert.equal(zip.type, 'application/zip');
assert.ok(zip.size > 100, `zip unexpectedly small: ${zip.size}`);

console.log('webfs storage smoke: ok');
