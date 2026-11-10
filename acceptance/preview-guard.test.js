// What keeps a page in the live preview's pane where it is, in each browser engine, with the
// real gate and the real guard, and a site and an editor that are small programs of this test:
// every way a page can try to load something else, what the pane is told of it, and what a page
// may still do. preview.test.js has it in a real site.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';

import { previewGuard } from '../src/astro/preview-guard.js';
import { SESSION_PATH, STOPPED_MESSAGE } from '../src/cms/preview/paths.js';
import { SANDBOX } from '../src/cms/preview/template.js';
import { previewGate } from '../src/preview/gate.js';
import { ENGINES } from './lib/editor.js';

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const pageWith = (title, head = '') => `<!doctype html><html><head><script>(${previewGuard})(${JSON.stringify(STOPPED_MESSAGE)});</script>${head}<title>${title}</title></head><body>
<h1 id="top">${title}</h1>
<a id="link" href="/other/">Another page</a>
<a id="out" href="https://example.com/">Another site</a>
<a id="mail" href="mailto:a@example.com">Mail</a>
<a id="blank" href="/other/" target="_blank">A new tab</a>
<a id="named" href="/other/" target="somewhere">A named window</a>
<a id="whole" href="/other/" target="_top">The whole window</a>
<a id="around" href="/other/" target="_parent">The frame around</a>
<a id="self" href="/work/">This page</a>
<a id="fragment" href="#top">A part of this page</a>
<a id="handled" href="/other/">A link the page handles</a>
<a id="scripted" href="/other/">A link the page sends on from</a>
<svg width="100" height="30"><a id="drawn" href="/other/"><text y="20">A drawn link</text></a></svg>
<div id="host"></div>
<map name="areas"><area id="area" shape="rect" coords="0,0,10,10" href="/other/"></map>
<form id="post" method="post" action="/other/"><button id="send">Send</button><button id="send-there" formaction="/there/">Send there</button></form>
<form id="get" method="get" action="/search/"><input name="q" value="x"><button id="find">Find</button></form>
<form id="handled-form" method="post" action="/other/"><button id="send-handled">Send, handled</button></form>
<script>
document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<a id="shaded" href="/other/">A link in a shadow tree</a>';
document.getElementById('handled').addEventListener('click', (event) => {
  event.preventDefault();
  window.handled = true;
});
document.getElementById('scripted').addEventListener('click', (event) => {
  event.preventDefault();
  location.href = '/there/';
});
document.getElementById('handled-form').addEventListener('submit', (event) => {
  event.preventDefault();
  window.handled = true;
});
</script>
</body></html>`;

describe('a page in the preview\'s pane', () => {
  let gate;
  let site;
  let gateServer;
  let forgejo;
  let admin;
  let preview;
  let adminOrigin;
  let asked;
  let moved;

  before(async () => {
    forgejo = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ permissions: { push: true } }));
    });
    site = createServer((incoming, outgoing) => {
      const { pathname } = new URL(incoming.url, 'http://x');
      asked.push(pathname);
      if (pathname === '/moved/' || (pathname === '/work/' && moved)) {
        outgoing.writeHead(301, { Location: '/other/' });
        return outgoing.end();
      }
      outgoing.writeHead(200, { 'Content-Type': 'text/html' });
      const shown = { '/work/': ['This page'], '/refreshing/': ['A page that refreshes', '<meta http-equiv="refresh" content="1;url=/other/">'] }[pathname] ?? ['Another page'];
      return outgoing.end(pageWith(...shown));
    });
    admin = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'Content-Type': 'text/html' });
      outgoing.end(`<!doctype html><iframe id="frame" sandbox="${SANDBOX}"></iframe><script>
        window.told = [];
        addEventListener('message', ({ data, source }) => {
          if (source === document.getElementById('frame').contentWindow && data.type === ${JSON.stringify(STOPPED_MESSAGE)}) told.push({ to: data.to, how: data.how });
        });
      </script>`);
    });
    gateServer = createServer((incoming, outgoing) => gate.request(incoming, outgoing));
    const [forgejoPort, sitePort, adminPort, gatePort] = await Promise.all([forgejo, site, admin, gateServer].map(listen));
    adminOrigin = `http://localhost:${adminPort}`;
    preview = `http://localhost:${gatePort}`;
    gate = previewGate({
      origin: preview,
      adminOrigin,
      forgejo: `http://127.0.0.1:${forgejoPort}`,
      repository: 'a/source',
      cookieName: 'a_preview',
      runner: {},
      dev: { port: sitePort, ensure: async () => {} },
    });
  });

  after(async () => {
    for (const server of [forgejo, site, admin, gateServer]) {
      server.closeAllConnections();
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  for (const engine of Object.keys(ENGINES)) {
    describe(`in ${engine}`, () => {
      let browser;
      let page;

      before(async () => {
        browser = await ENGINES[engine].launch();
        page = await (await browser.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
      });
      after(() => browser?.close());

      const frame = () => page.frameLocator('#frame');
      const inFrame = (work, argument) => frame().locator('html').evaluate(work, argument);
      // The frame, on a page marked, so that a new document shows, with a step in the window's
      // history behind it to be taken.
      const open = async (path = '/work/') => {
        await page.goto(`${adminOrigin}/?before`);
        await page.goto(`${adminOrigin}/`);
        assert.equal(await page.evaluate(async ([url]) => (await fetch(url, { method: 'POST', credentials: 'include', headers: { authorization: 'token a' } })).status, [`${preview}${SESSION_PATH}`]), 200);
        asked = [];
        moved = false;
        await page.evaluate((src) => {
          document.getElementById('frame').src = src;
        }, `${preview}${path}`);
        await frame().locator('h1').waitFor();
        await inFrame(() => {
          window.kept = true;
        });
      };
      const settled = () => page.waitForTimeout(400);
      const told = () => page.evaluate(() => window.told);
      const toldBy = async (count) => {
        for (let waited = 0; waited < 3000 && (await told()).length < count; waited += 50) await page.waitForTimeout(50);
        await settled();
        return told();
      };
      const stayed = async () => {
        assert.equal(await inFrame(() => window.kept), true, 'the same document is in the frame');
        assert.equal(await page.url(), `${adminOrigin}/`, 'the editor around it has not moved');
      };
      const stopped = async (how, to, attempt) => {
        await open();
        await attempt();
        assert.deepEqual(await toldBy(1), [{ how, to: to.includes(':') ? to : `${preview}${to}` }]);
        await stayed();
      };
      const click = (selector, options) => () => frame().locator(selector).click(options);
      const run = (code) => () => inFrame(code);

      const LINKS = {
        'a link': ['link', '/other/', click('#link')],
        'a link in a shadow tree': ['link', '/other/', click('#shaded')],
        'a drawn link': ['link', '/other/', click('#drawn')],
        'a link in an image map': ['link', '/other/', run(() => document.getElementById('area').click())],
        'a link to another site': ['link', 'https://example.com/', click('#out')],
        'a link to an email address': ['link', 'mailto:a@example.com', click('#mail')],
        'a link to a new tab': ['window', '/other/', click('#blank')],
        'a link to a named window': ['window', '/other/', click('#named')],
        'a link to the whole window': ['link', '/other/', click('#whole')],
        'a link to the frame around': ['link', '/other/', click('#around')],
        'a link with the middle button': ['link', '/other/', click('#link', { button: 'middle' })],
        'a link to this page again': ['link', '/work/', click('#self')],
        'a link the page sends on from': ['script', '/there/', click('#scripted')],
        'a form that posts': ['form', '/other/', click('#send')],
        'a form that gets': ['form', '/search/', click('#find')],
        'a button with an action of its own': ['form', '/there/', click('#send-there')],
        'a form posted from a script': ['form', '/other/', run(() => document.getElementById('post').submit())],
        'an assignment to `location`': ['script', '/other/', run(() => {
          location.href = '/other/';
        })],
        'location.assign': ['script', '/other/', run(() => location.assign('/other/'))],
        'location.replace': ['script', '/other/', run(() => location.replace('/other/'))],
        'location.replace to this page with another query': ['script', '/work/?another', run(() => location.replace('/work/?another'))],
        'a form posted to this page from a script': ['form', '/work/', run(() => {
          const form = document.getElementById('post');
          form.action = '/work/';
          form.submit();
        })],
        'a script off to another site': ['script', 'https://example.com/', run(() => {
          location.href = 'https://example.com/';
        })],
        'a new window from a script': ['window', '/other/', run(() => window.open('/other/'))],
      };
      for (const [name, [how, to, attempt]] of Object.entries(LINKS)) {
        test(`stays, and tells, at ${name}`, () => stopped(how, to, attempt));
      }

      test('stays, and tells, at a refresh in a tag', async () => {
        await open('/refreshing/');
        assert.deepEqual(await toldBy(1), [{ how: 'script', to: `${preview}/other/` }]);
        await stayed();
        assert.equal(asked.includes('/other/'), false);
      });

      const STEPS = { 'history.back()': () => history.back(), 'history.forward()': () => history.forward(), 'history.go(-1)': () => history.go(-1) };
      for (const [name, step] of Object.entries(STEPS)) {
        test(`stays, with the editor around it, at ${name}`, async () => {
          await open();
          await inFrame(step);
          assert.deepEqual(await toldBy(1), [{ how: 'history', to: '' }]);
          await stayed();
        });
      }

      test('gives a script its usual answer to a window it cannot have', async () => {
        await open();
        assert.equal(await inFrame(() => window.open('/other/')), null);
      });

      test('asks nothing of the place it was kept from', async () => {
        await open();
        await frame().locator('#link').click();
        await toldBy(1);
        assert.equal(asked.includes('/other/'), false);
      });

      test('tells of a click each time, as it is a person who clicks', async () => {
        await open();
        await frame().locator('#link').click();
        await frame().locator('#link').click();
        assert.equal((await toldBy(2)).length, 2);
      });

      test('tells of a script that keeps trying once, and goes on showing the page', async () => {
        await open();
        await inFrame(() => {
          for (let time = 0; time < 50; time += 1) location.href = '/other/';
        });
        await settled();
        assert.equal((await told()).length, 1);
        await stayed();
      });

      test('tells a few times of a script that tries one new address after another, and then no more', async () => {
        await open();
        await inFrame(() => {
          for (let time = 0; time < 50; time += 1) location.href = `/other/${time}/`;
        });
        await settled();
        assert.equal((await told()).length, 5);
        await stayed();
      });

      test('goes to a part of itself', async () => {
        await open();
        await frame().locator('#fragment').click();
        await settled();
        assert.equal(await inFrame(() => location.hash), '#top');
        assert.deepEqual(await told(), []);
        await stayed();
      });

      test('changes its own address without loading anything', async () => {
        await open();
        await inFrame(() => {
          history.pushState({}, '', '/work/#pushed');
          location.hash = 'there';
        });
        await settled();
        assert.deepEqual(await told(), []);
        await stayed();
      });

      test('leaves to the page what the page handles itself', async () => {
        await open();
        await frame().locator('#handled').click();
        await frame().locator('#send-handled').click();
        await settled();
        assert.equal(await inFrame(() => window.handled), true);
        assert.deepEqual(await told(), []);
        await stayed();
      });

      test('reloads, as a dev server has it do to show a change', async () => {
        await open();
        await inFrame(() => location.reload());
        await settled();
        await frame().locator('h1', { hasText: 'This page' }).waitFor();
        assert.equal(await inFrame(() => window.kept), undefined, 'a new document');
        assert.deepEqual(await told(), []);
      });

      test('replaces itself with its own address, as the preview has it do to draw a change', async () => {
        await open('/work/?draft=1');
        await inFrame(() => location.replace(location.href));
        await settled();
        await frame().locator('h1', { hasText: 'This page' }).waitFor();
        assert.equal(await inFrame(() => window.kept), undefined, 'a new document');
        assert.equal(await inFrame(() => location.pathname + location.search), '/work/?draft=1');
        assert.deepEqual(await told(), []);
        assert.equal(await page.url(), `${adminOrigin}/`, 'the editor around it has not moved');
      });

      test('stays when a reload would redirect, and follows nothing', async () => {
        await open();
        moved = true;
        await inFrame(() => location.reload());
        await settled();
        await stayed();
        assert.equal(asked.includes('/other/'), false);
        assert.deepEqual(await told(), []);
      });

      test('stays empty when the first thing a frame is asked for redirects', async () => {
        await page.goto(`${adminOrigin}/`);
        asked = [];
        await page.evaluate((src) => {
          document.getElementById('frame').src = src;
        }, `${preview}/moved/`);
        await settled();
        assert.equal(asked.includes('/moved/'), true);
        assert.equal(asked.includes('/other/'), false);
        assert.equal(await frame().locator('h1').count(), 0);
      });

      test('in a tab of its own goes wherever it is sent, as there is no pane to keep', async () => {
        const tab = await page.context().newPage();
        try {
          await tab.goto(`${preview}/work/`);
          await tab.locator('#link').click();
          await tab.waitForURL(`${preview}/other/`);
          await tab.goto(`${preview}/moved/`);
          assert.equal(tab.url(), `${preview}/other/`);
        } finally {
          await tab.close();
        }
      });
    });
  }
});
