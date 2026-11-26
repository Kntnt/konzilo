// What an Admin's *Addresses not found* page asks of the service in its role for editors
// (ADR 0040): the addresses visitors asked for in vain, folded as the page asks, each with how
// often and when last, most asked first, but those an Admin hid and those a rule holds; and one
// hidden, which goes on being counted. An Admin's alone, an Editor told only that, and whoever may
// not write nothing.

import { answerJson, answerMethods, asAdmin, jsonOf } from './answers.js';

export const NOT_FOUND_PAGE_PATH = '/_konzilo/not-found';
const HIDDEN = '/hidden';

// The most an address to hide takes, as JSON.
const HIDDEN_LIMIT = 4096;

// The page's answers. `notFound`: the log of addresses not found, as not-found.js gives it, or null
// where there is none. `adminOf(credential)`: as answers.js's asAdmin() takes it. `forgejo`,
// `repository`: where the source repository is. `token`: a credential that can read it. `get`: what
// reaches Forgejo. `warn`: the service's log.
//
// Gives { owns(pathname), answer(incoming, outgoing, pathname) }.
export function notFoundPage({ notFound, adminOf, forgejo, repository, token, get = fetch, warn = console.error }) {
  // The rules the source's `redirects.json` holds, as it stands now: an Admin's save of a rule has
  // just written it, before any build. None where there is no file, or none the site reads. Throws
  // where Forgejo cannot be asked.
  const sourceRules = async () => {
    const answer = await get(`${forgejo}/api/v1/repos/${repository}/raw/redirects.json?ref=main`, { headers: { authorization: `token ${token}` } });
    if (answer.status === 404) return [];
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} about redirects.json`);
    let given;
    try {
      given = JSON.parse(await answer.text());
    } catch {
      return [];
    }
    return Array.isArray(given) ? given : Array.isArray(given?.rules) ? given.rules : [];
  };

  return {
    owns: (pathname) => pathname === NOT_FOUND_PAGE_PATH || pathname.startsWith(`${NOT_FOUND_PAGE_PATH}/`),

    async answer(incoming, outgoing, pathname) {
      const below = pathname.slice(NOT_FOUND_PAGE_PATH.length);
      if (below !== '' && below !== HIDDEN) {
        incoming.resume();
        return answerJson(outgoing, 404, {});
      }
      const method = below === '' ? 'GET' : 'POST';
      if (incoming.method !== method) return answerMethods(incoming, outgoing, [method]);
      if (!notFound) {
        incoming.resume();
        return answerJson(outgoing, 404, {});
      }
      if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
      if (method === 'POST') {
        const given = await jsonOf(incoming, outgoing, HIDDEN_LIMIT);
        if (given === undefined) return undefined;
        if (typeof given?.address !== 'string') return answerJson(outgoing, 400, {});
        if (!notFound.hide(given.address)) return answerJson(outgoing, 404, {});
      } else {
        incoming.resume();
      }
      let rules;
      try {
        rules = await sourceRules();
      } catch (error) {
        warn(`The addresses not found could not be told: ${error.message}`);
        return answerJson(outgoing, 502, {});
      }
      return answerJson(outgoing, 200, { addresses: notFound.listed({ sourceRules: rules }) });
    },
  };
}
