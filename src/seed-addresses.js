// What the seed makes in Forgejo that points at one of the site's addresses, kept at that address
// at every start, so that a copy whose ports or peers change still signs in and publishes (ADR
// 0007): the editor's and the live preview's OAuth clients, and the webhook. Each function talks
// through `call(method, path, body)`, which answers { status, body } from Forgejo's API as the
// instance's account, and changes nothing that is already so.

const must = (what, { status, body }, ...expected) => {
  if (!expected.includes(status)) throw new Error(`${what}: ${status} ${JSON.stringify(body)}`);
  return body;
};

// An OAuth client of the instance's account, public, with PKCE only, whose one address is
// `address`: the one whose client ID is `id` where one is given, else the one named `name`, made
// where there is none. Answers the client, with its `client_id`.
export async function keepClient(call, { name, address, id }) {
  const wanted = { name, redirect_uris: [address], confidential_client: false };
  const clients = must('listing the OAuth clients', await call('GET', '/user/applications/oauth2?limit=50'), 200);
  const found = clients.find((client) => id && client.client_id === id) ?? clients.find((client) => client.name === name);
  if (!found) return must(`making the OAuth client ${name}`, await call('POST', '/user/applications/oauth2', wanted), 201);
  if (found.confidential_client || found.redirect_uris.join('\n') !== address) {
    // Forgejo's API gives a client a new secret with every change, which nothing reads, since the
    // client is public; its client ID stays.
    return must(`keeping the OAuth client ${name} to its address`, await call('PATCH', `/user/applications/oauth2/${found.id}`, wanted), 200);
  }
  return found;
}

const pathOf = (address) => (URL.canParse(address) ? new URL(address).pathname : null);

// The webhook of `repository`, `owner/name`, which tells the service for editors at `address`
// that something may have been pushed to main, and holds no secret, since that is all it says.
// The seed's are the hooks whose address has the same path as `address` on whatever host and port
// they reach: the one at `address`, else the first, is kept there, the others removed, so that
// a changed address never leaves a hook whose every delivery fails.
export async function keepHook(call, repository, address) {
  const wanted = { type: 'forgejo', active: true, events: ['push'], branch_filter: 'main', config: { content_type: 'json', url: address } };
  const hooks = must('listing the webhooks', await call('GET', `/repos/${repository}/hooks`), 200);
  const ours = hooks.filter(({ config }) => pathOf(config?.url) === pathOf(address));
  const kept = ours.find(({ config }) => config.url === address) ?? ours[0];
  const others = ours.filter((hook) => hook !== kept);
  if (!kept) must('making the webhook', await call('POST', `/repos/${repository}/hooks`, wanted), 201);
  else if (kept.config.url !== address) {
    const { type, ...changed } = wanted;
    must('keeping the webhook to its address', await call('PATCH', `/repos/${repository}/hooks/${kept.id}`, changed), 200);
  }
  for (const { id } of others) must('removing a webhook at an address the service has left', await call('DELETE', `/repos/${repository}/hooks/${id}`), 204, 404);
}
