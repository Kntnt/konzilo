// A page of the live preview whose body holds components within components, the site's own,
// from Astro's dev server as the preview runs it, behind the real gate, in each browser engine:
// its design's child selectors find what they find on the public site, and a click on a nested
// component, and a field's request to show one, find it (ADR 0032, ADR 0064). The components and
// the design are this test's own; preview.test.js has the live preview in a real site.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLACE_MESSAGE, SESSION_PATH, SHOW_MESSAGE } from '../src/cms/preview/paths.js';
import { SANDBOX } from '../src/cms/preview/template.js';
import { previewGate } from '../src/preview/gate.js';
import { astroConfig, astroEnvironment } from '../tests/lib/astro.js';
import { ENGINES } from './lib/editor.js';
import { runnerStandIn } from './lib/runner.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const integration = join(core, 'src/astro/index.js');

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const freePort = async () => {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => {
    probe.close(resolve);
  });
  return port;
};

// A section, which places its mark itself on its root, holding a kicker, which places none, and
// another section; the design lays them out by child selectors, as the design system does, which
// a wrapper between them would break.
const SITE = {
  language: 'en_GB',
  components: {
    section: { label: 'Section', form: 'container', body: 'blocks' },
    kicker: { label: 'Kicker', form: 'leaf', body: 'text' },
  },
  types: { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'heading', 'section', 'kicker'], fields: {} } },
};
const BODY = ['Before', ':::section', '::kicker[A kicker]', '## Inside', '::::section', 'Deep inside', '::::', ':::', 'After'].join('\n\n');
const DESIGN = `
.site-section { padding: 24px; }
.site-section > .site-band > .site-kicker { color: rgb(200, 0, 0); }
.site-section > .site-band > .site-section { border-left: 7px solid rgb(0, 0, 200); }
`;
const FILES = {
  'astro.config.mjs': astroConfig(integration, { directives: { section: './src/components/Section.astro', kicker: './src/components/Kicker.astro' } }),
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'site-description.json': JSON.stringify(SITE),
  'src/components/Section.astro': '<section class="site-section" data-konzilo-block={Astro.props["data-konzilo-block"]}><div class="site-band"><slot /></div></section>\n',
  'src/components/Kicker.astro': '<p class="site-kicker"><slot /></p>\n',
  'src/pages/[slug].astro': [
    '---',
    "import { getCollection, render } from 'astro:content';",
    `import Body from ${JSON.stringify(join(core, 'src/astro/Body.astro'))};`,
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    'const { Content } = await render(entry);',
    '---',
    `<html lang="en"><head><meta charset="utf-8"><title>Components</title><style is:global>${DESIGN}</style></head>`,
    '<body><h1>Components</h1><article><Body><Content /></Body></article></body></html>',
    '',
  ].join('\n'),
  'content/articles/nested.md': `---\ntitle: "Nested"\n---\n\n${BODY}\n`,
};

describe('a page of the live preview with components within components', () => {
  let repository;
  let dev;
  let forgejo;
  let admin;
  let gateServer;
  let preview;
  let adminOrigin;

  before(async () => {
    repository = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-preview-components-')));
    symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
    for (const [path, contents] of Object.entries(FILES)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    const devPort = await freePort();
    // In the foreground, which Astro leaves for the background when it finds itself run by an
    // agent, unless told to ignore its lock file; as the preview runs it.
    dev = spawn(process.execPath, [join(core, 'node_modules/astro/bin/astro.mjs'), 'dev', '--host', '127.0.0.1', '--port', String(devPort), '--ignore-lock'], {
      cwd: repository,
      env: { ...astroEnvironment, KONZILO_PREVIEW: '1' },
      stdio: 'ignore',
      detached: true,
    });
    forgejo = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ permissions: { push: true } }));
    });
    // The editor around the pane: what the page tells it of a click, and a field's request.
    admin = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'Content-Type': 'text/html' });
      outgoing.end(`<!doctype html><iframe id="frame" sandbox="${SANDBOX}" style="display: block; border: 0; width: 1000px; height: 700px; background: #fff"></iframe><script>
        window.told = [];
        addEventListener('message', ({ data, source }) => {
          if (source === document.getElementById('frame').contentWindow && data.type === ${JSON.stringify(PLACE_MESSAGE)}) told.push({ block: data.block, path: data.path });
        });
        window.show = (path, origin) => document.getElementById('frame').contentWindow.postMessage({ type: ${JSON.stringify(SHOW_MESSAGE)}, path, text: '' }, origin);
      </script>`);
    });
    let gate;
    gateServer = createServer((incoming, outgoing) => gate.request(incoming, outgoing));
    gateServer.on('upgrade', (incoming, socket, head) => gate.upgrade(incoming, socket, head));
    const [forgejoPort, adminPort, gatePort] = await Promise.all([forgejo, admin, gateServer].map(listen));
    adminOrigin = `http://localhost:${adminPort}`;
    preview = `http://localhost:${gatePort}`;
    gate = previewGate({
      origin: preview,
      adminOrigin,
      forgejo: `http://127.0.0.1:${forgejoPort}`,
      repository: 'a/source',
      cookieName: 'a_preview',
      runner: runnerStandIn(),
      dev: { port: devPort, ensure: async () => {}, ready: () => true },
    });
    // Once its page is drawn. Ninety seconds, as a dev server may take, its first page among them.
    for (let waited = 0; ; waited += 500) {
      const answered = await fetch(`http://127.0.0.1:${devPort}/nested/`).then((answer) => answer.text(), () => '');
      if (answered.includes('Deep inside')) break;
      if (waited > 90_000) throw new Error('the dev server did not answer in time');
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }
  }, { timeout: 120_000 });

  after(async () => {
    try {
      process.kill(-dev.pid);
    } catch {
      // It has ended already.
    }
    for (const server of [forgejo, admin, gateServer].filter(Boolean)) {
      server.closeAllConnections();
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
    rmSync(repository, { recursive: true, force: true });
  });

  for (const engine of Object.keys(ENGINES)) {
    describe(`in ${engine}`, () => {
      let browser;
      let page;

      before(async () => {
        browser = await ENGINES[engine].launch();
        page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
        await page.goto(`${adminOrigin}/`);
        assert.equal(await page.evaluate(async ([url]) => (await fetch(url, { method: 'POST', credentials: 'include', headers: { authorization: 'token a' } })).status, [`${preview}${SESSION_PATH}`]), 200);
        await page.evaluate((src) => {
          document.getElementById('frame').src = src;
        }, `${preview}/nested/`);
        // The dev server may reload the page once as it first serves its scripts, as Vite does when
        // it has prepared what they import: the page is used once it has stayed a second and a half.
        const html = page.frameLocator('#frame').locator('html');
        for (let tries = 0; ; tries += 1) {
          await page.frameLocator('#frame').getByText('Deep inside').waitFor({ timeout: 60_000 });
          await html.evaluate(() => {
            window.stayed = true;
          }).catch(() => {});
          await page.waitForTimeout(1500);
          if (await html.evaluate(() => window.stayed === true).catch(() => false)) break;
          if (tries === 5) throw new Error('the page never stayed');
        }
      }, { timeout: 120_000 });
      after(() => browser?.close());

      const frame = () => page.frameLocator('#frame');
      const kicker = () => frame().locator('.site-kicker');
      const inner = () => frame().locator('.site-section .site-section');
      const toldBy = async (count) => {
        for (let waited = 0; waited < 3000 && (await page.evaluate(() => window.told.length)) < count; waited += 50) await page.waitForTimeout(50);
        return page.evaluate(() => window.told.splice(0));
      };

      test('lays the components out by the design\'s child selectors, as on the public site', async () => {
        assert.equal(await kicker().evaluate((element) => getComputedStyle(element).color), 'rgb(200, 0, 0)');
        assert.equal(await inner().evaluate((element) => getComputedStyle(element).borderLeftWidth), '7px');
        assert.equal(await frame().locator('.site-section .konzilo-preview-part').count(), 0, 'with no wrapper inside a component');
      });

      test('tells the editor which block a click on a nested component is', async () => {
        await kicker().click();
        assert.deepEqual(await toldBy(1), [{ block: 1, path: '1.0' }]);
        // The inner section's own padding, outside the blocks it holds.
        await inner().click({ position: { x: 4, y: 4 } });
        assert.deepEqual(await toldBy(1), [{ block: 1, path: '1.2' }]);
        await frame().getByText('Deep inside').click();
        assert.deepEqual(await toldBy(1), [{ block: 1, path: '1.2.0' }]);
      });

      test('shows a nested component a field asks for, marked, and tells the design', async () => {
        await frame().locator('html').evaluate(() => {
          window.shown = [];
          document.addEventListener('konzilo-preview-show', ({ target }) => window.shown.push(target.className));
        });
        const marked = (element) => element().evaluate((one) => one.style.boxShadow !== '');
        for (const [path, element, name] of [['1.2', inner, 'site-section'], ['1.0', kicker, 'site-kicker']]) {
          await page.evaluate(([to, origin]) => window.show(to, origin), [path, preview]);
          for (let waited = 0; waited < 3000 && !(await marked(element)); waited += 50) await page.waitForTimeout(50);
          assert.equal(await marked(element), true, `${path}: the component itself is marked`);
          assert.equal(await frame().locator('[style*="box-shadow"]').count(), 1, `${path}: and nothing else`);
          assert.equal(await frame().locator('html').evaluate(() => window.shown.at(-1)), name);
        }
      });
    });
  }
});
