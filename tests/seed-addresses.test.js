// What the seed makes in Forgejo that points at one of the site's addresses, kept at that address
// at every start (ADR 0007): the editor's and the live preview's OAuth clients, at the admin
// host's and the preview's, and the webhook, at the service for editors.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { keepClient, keepHook } from '../src/seed-addresses.js';

// Forgejo's API for the OAuth clients of the instance's account, as a stand-in keeps them, with
// every call that changes one. A change of a client gives it a new secret, as Forgejo's API does.
function forgejo({ clients: given = [] } = {}) {
  let next = 1;
  const clients = given.map((client) => ({ id: next++, confidential_client: false, ...client }));
  const changes = [];
  const shown = ({ secret, ...client }) => ({ ...client, client_secret: '' });
  const call = async (method, path, body) => {
    if (method === 'GET' && path.startsWith('/user/applications/oauth2?')) return { status: 200, body: clients.map(shown) };
    if (method === 'POST' && path === '/user/applications/oauth2') {
      const client = { id: next++, client_id: `client-${next}`, secret: `secret-${next}`, ...body };
      clients.push(client);
      changes.push(`made ${body.name}`);
      return { status: 201, body: { ...client, client_secret: client.secret } };
    }
    const id = /^\/user\/applications\/oauth2\/(\d+)$/.exec(path)?.[1];
    const client = clients.find((one) => one.id === Number(id));
    if (method === 'PATCH' && client) {
      Object.assign(client, body, { secret: `${client.secret}-anew` });
      changes.push(`changed ${client.name}`);
      return { status: 200, body: { ...client, client_secret: client.secret } };
    }
    return { status: 404, body: { message: 'not found' } };
  };
  return { call, clients, changes };
}

const editor = (address = 'http://localhost:8081/', id) => ({ name: 'Konzilo', address, id });
const preview = (address = 'http://localhost:4321/_konzilo/preview/sign-in') => ({ name: 'Konzilo live preview', address });

describe('keeping an OAuth client', () => {
  test('makes the editor\'s and the preview\'s, each public at its one address, where they are missing', async () => {
    const stand = forgejo();
    const made = await keepClient(stand.call, editor());
    await keepClient(stand.call, preview());
    assert.deepEqual(stand.clients.map(({ name, redirect_uris, confidential_client }) => ({ name, redirect_uris, confidential_client })), [
      { name: 'Konzilo', redirect_uris: ['http://localhost:8081/'], confidential_client: false },
      { name: 'Konzilo live preview', redirect_uris: ['http://localhost:4321/_konzilo/preview/sign-in'], confidential_client: false },
    ]);
    assert.equal(made.client_id, stand.clients[0].client_id);
  });

  // After a change of the admin host's port, Forgejo refuses a redirect to the old address.
  test('brings each to its address where it differs, keeping its client ID, which the editor\'s configuration holds', async () => {
    const stand = forgejo({ clients: [
      { name: 'Konzilo', client_id: 'editor-id', redirect_uris: ['http://localhost:8081/'] },
      { name: 'Konzilo live preview', client_id: 'preview-id', redirect_uris: ['http://localhost:4321/_konzilo/preview/sign-in'] },
    ] });
    const kept = await keepClient(stand.call, editor('http://localhost:9091/', 'editor-id'));
    await keepClient(stand.call, preview('http://localhost:5321/_konzilo/preview/sign-in'));
    assert.equal(kept.client_id, 'editor-id');
    assert.deepEqual(stand.clients.map(({ client_id, redirect_uris }) => ({ client_id, redirect_uris })), [
      { client_id: 'editor-id', redirect_uris: ['http://localhost:9091/'] },
      { client_id: 'preview-id', redirect_uris: ['http://localhost:5321/_konzilo/preview/sign-in'] },
    ]);
    assert.deepEqual(stand.changes, ['changed Konzilo', 'changed Konzilo live preview']);
  });

  test('changes nothing, and no secret, where each is public at its address', async () => {
    const stand = forgejo({ clients: [
      { name: 'Konzilo', client_id: 'editor-id', secret: 'editor-secret', redirect_uris: ['http://localhost:8081/'] },
      { name: 'Konzilo live preview', client_id: 'preview-id', secret: 'preview-secret', redirect_uris: ['http://localhost:4321/_konzilo/preview/sign-in'] },
    ] });
    assert.equal((await keepClient(stand.call, editor(undefined, 'editor-id'))).client_id, 'editor-id');
    assert.equal((await keepClient(stand.call, preview())).client_id, 'preview-id');
    assert.deepEqual(stand.changes, []);
    assert.deepEqual(stand.clients.map(({ secret }) => secret), ['editor-secret', 'preview-secret']);
  });

  test('makes public one that is confidential, and gives it its one address in place of several', async () => {
    const stand = forgejo({ clients: [{ name: 'Konzilo', client_id: 'editor-id', confidential_client: true, redirect_uris: ['http://localhost:8081/'] }] });
    await keepClient(stand.call, editor(undefined, 'editor-id'));
    assert.equal(stand.clients[0].confidential_client, false);
    stand.clients[0].redirect_uris = ['http://localhost:8081/', 'http://localhost:9091/'];
    await keepClient(stand.call, editor(undefined, 'editor-id'));
    assert.deepEqual(stand.clients[0].redirect_uris, ['http://localhost:8081/']);
  });

  test('finds the editor\'s by the client ID the seed keeps, else by its name, so that it never makes a second', async () => {
    const stand = forgejo({ clients: [
      { name: 'Konzilo', client_id: 'stray-id', redirect_uris: ['http://localhost:8081/'] },
      { name: 'Konzilo', client_id: 'editor-id', redirect_uris: ['http://localhost:8081/'] },
    ] });
    await keepClient(stand.call, editor('http://localhost:9091/', 'editor-id'));
    assert.deepEqual(stand.clients.map(({ redirect_uris: [address] }) => address), ['http://localhost:8081/', 'http://localhost:9091/']);
    assert.equal((await keepClient(stand.call, editor('http://localhost:9091/'))).client_id, 'stray-id');
    assert.equal(stand.clients.length, 2);
  });

  test('says what failed, with the client, where Forgejo answers otherwise', async () => {
    await assert.rejects(keepClient(async () => ({ status: 500, body: 'down' }), editor()), /listing the OAuth clients: 500/);
    const refusing = (refused) => async (method) => (method === 'GET' ? { status: 200, body: [{ id: 1, name: 'Konzilo', client_id: 'editor-id', redirect_uris: [] }] } : { status: 403, body: refused });
    await assert.rejects(keepClient(refusing('no'), editor()), /keeping the OAuth client Konzilo to its address: 403/);
    await assert.rejects(keepClient(refusing('no'), preview()), /making the OAuth client Konzilo live preview: 403/);
  });
});

// Forgejo's API for a repository's webhooks, as a stand-in keeps them, with every call that
// changes one.
function hooksOf(urls = []) {
  let next = 1;
  const hooks = urls.map((url) => ({ id: next++, type: 'forgejo', active: true, events: ['push'], branch_filter: 'main', config: { content_type: 'json', url } }));
  const changes = [];
  const call = async (method, path, body) => {
    if (!path.startsWith('/repos/lantern/source/hooks')) return { status: 404, body: { message: 'not found' } };
    const id = /\/hooks\/(\d+)$/.exec(path)?.[1];
    const hook = hooks.find((one) => one.id === Number(id));
    if (method === 'GET' && !id) return { status: 200, body: hooks };
    if (method === 'POST' && !id) {
      hooks.push({ id: next++, ...body });
      changes.push(`made ${body.config.url}`);
      return { status: 201, body: hooks.at(-1) };
    }
    if (method === 'PATCH' && hook) {
      Object.assign(hook, body, { config: { ...hook.config, ...body.config } });
      changes.push(`moved ${hook.id} to ${hook.config.url}`);
      return { status: 200, body: hook };
    }
    if (method === 'DELETE' && hook) {
      hooks.splice(hooks.indexOf(hook), 1);
      changes.push(`removed ${hook.id}`);
      return { status: 204, body: '' };
    }
    return { status: 404, body: { message: 'not found' } };
  };
  return { call, hooks, changes, urls: () => hooks.map(({ config }) => config.url) };
}

describe('keeping the webhook', () => {
  test('makes it where there is none, on a push to main, at the service for editors', async () => {
    const stand = hooksOf();
    await keepHook(stand.call, 'lantern/source', 'http://editors:4100/webhook');
    assert.deepEqual(stand.hooks, [{ id: 1, type: 'forgejo', active: true, events: ['push'], branch_filter: 'main', config: { content_type: 'json', url: 'http://editors:4100/webhook' } }]);
  });

  // A changed KONZILO_PEER_EDITORS, or its port, would otherwise leave a hook at the old address,
  // whose every delivery fails, beside a new one.
  test('brings the one hook to the service\'s address where it differs, and removes any other the seed made', async () => {
    const stand = hooksOf(['http://editors:4100/webhook', 'http://127.0.0.1:4100/webhook']);
    await keepHook(stand.call, 'lantern/source', 'http://127.0.0.1:4111/webhook');
    assert.deepEqual(stand.urls(), ['http://127.0.0.1:4111/webhook']);
    assert.equal(stand.hooks[0].id, 1);
    assert.deepEqual(stand.changes, ['moved 1 to http://127.0.0.1:4111/webhook', 'removed 2']);
    const twice = hooksOf(['http://editors:4100/webhook', 'http://editors:4111/webhook']);
    await keepHook(twice.call, 'lantern/source', 'http://editors:4111/webhook');
    assert.deepEqual(twice.changes, ['removed 1'], 'keeping the one at the address where there is one');
  });

  test('changes nothing where it is at its address, and no hook of another address', async () => {
    const stand = hooksOf(['https://hooks.example/notify', 'http://editors:4100/webhook']);
    await keepHook(stand.call, 'lantern/source', 'http://editors:4100/webhook');
    assert.deepEqual(stand.changes, []);
    const other = hooksOf(['https://hooks.example/notify', 'http://editors:4100/webhook']);
    await keepHook(other.call, 'lantern/source', 'http://editors:4111/webhook');
    assert.deepEqual(other.urls(), ['https://hooks.example/notify', 'http://editors:4111/webhook']);
  });

  test('says what failed where Forgejo answers otherwise', async () => {
    await assert.rejects(keepHook(async () => ({ status: 500, body: 'down' }), 'lantern/source', 'http://editors:4100/webhook'), /listing the webhooks: 500/);
    const refusing = async (method) => (method === 'GET' ? { status: 200, body: [] } : { status: 403, body: 'no' });
    await assert.rejects(keepHook(refusing, 'lantern/source', 'http://editors:4100/webhook'), /making the webhook: 403/);
  });
});
