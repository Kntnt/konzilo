// A site's own components: the directives its site description declares under
// `components`, read into the rule data its bodies are read against, held to their
// attributes, written back in the exact form with their blocks or their label, and
// checked for what they hold by the site's own module, `componentChecks`.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { handsFor, refusalsOf } from '../src/cms/body/check.js';
import { useComponents } from '../src/cms/body/components.js';
import { cmsConfig } from '../src/cms/config.js';
import { withComponents } from '../src/format/components.js';
import rules from '../src/format/rules.json' with { type: 'json' };
import { componentChecksOf } from '../src/intake/component-checks.js';
import { reader } from '../src/intake/reader.js';
import { siteDescription, siteRules } from '../src/site-description.js';
import { everyElement, pageFile, pagePath, pageSource, run, written } from './lib/intake.js';

const components = {
  section: {
    label: 'Section',
    form: 'container',
    body: 'blocks',
    attributes: {
      surface: { type: 'string', label: 'Surface', values: ['page', 'raised'], default: 'page' },
      anchor: { type: 'string', label: 'Anchor', default: '', pattern: '^[a-z-]*$', refusal: '"{value}" is no anchor; write lowercase letters and hyphens' },
    },
  },
  eyebrow: { label: 'Eyebrow', form: 'leaf', body: 'text' },
  breadcrumbs: { label: 'Breadcrumbs', form: 'leaf', body: 'none' },
  list: { label: 'Series', form: 'container', body: 'blocks', attributes: { type: { type: 'string', values: ['', 'logos'], default: '' } } },
};
const own = (extra = {}) => ({
  ...everyElement,
  components,
  types: { page: { ...everyElement.types.page, elements: [...everyElement.types.page.elements, 'section', 'eyebrow', 'breadcrumbs', 'list-directive'] } },
  ...extra,
});

const out = (body, site = own(), options = {}) => {
  const result = run({ [pagePath]: pageSource(body) }, site, options);
  return { refusals: result.refusals.map((one) => one.message), text: written(result)[pagePath.replace(/[^/]+$/, 'hello-world.md')] };
};

describe('the site description', () => {
  test('reads each component, and names the one called as a core element by <name>-directive', () => {
    const site = siteDescription(own());
    assert.deepEqual(Object.keys(site.components), ['section', 'eyebrow', 'breadcrumbs', 'list']);
    assert.equal(site.components.list.element, 'list-directive');
    assert.equal(site.components.section.element, 'section');
    const ruled = siteRules(site);
    assert.equal(ruled.elements['list-directive'].directive.name, 'list');
    assert.deepEqual(ruled.elements.list, rules.elements.list);
    assert.ok(ruled.elements.section.inner.includes('eyebrow'));
    assert.deepEqual(ruled.elements.eyebrow.inline, rules.elements.heading.inline);
    assert.equal(siteRules(siteDescription(everyElement)), rules);
  });

  test('refuses a type that names a component the site does not declare', () => {
    assert.throws(() => siteDescription({ ...everyElement, types: { page: { ...everyElement.types.page, elements: ['paragraph', 'section'] } } }), /types\.page\.elements: the core cannot publish the element "section"/);
  });

  for (const [what, declared, problem] of [
    ['a component named as the core\'s own directive', { form: { label: 'Form', form: 'leaf', body: 'none' } }, /components\.form: form is the core's own directive/],
    ['a name that is no directive\'s', { Big: { label: 'Big', form: 'leaf', body: 'none' } }, /components\.Big: a component's name is lowercase letters/],
    ['a container with a text body', { box: { label: 'Box', form: 'container', body: 'text' } }, /components\.box\.body: a container's body is blocks/],
    ['a component without a label', { box: { form: 'container', body: 'blocks' } }, /components\.box\.label: must be a non-empty string, or one by interface language/],
    ['an attribute required and with a default', { box: { label: 'Box', form: 'container', body: 'blocks', attributes: { tone: { type: 'string', required: true, default: 'x' } } } }, /components\.box\.attributes\.tone: is required, or has a default, not both/],
    ['a default that is none of the values', { box: { label: 'Box', form: 'container', body: 'blocks', attributes: { tone: { type: 'string', values: ['a'], default: 'b' } } } }, /components\.box\.attributes\.tone\.default: must be one of its values/],
    ['a pattern that is no regular expression', { box: { label: 'Box', form: 'container', body: 'blocks', attributes: { tone: { type: 'string', pattern: '(' } } } }, /components\.box\.attributes\.tone\.pattern: must be a regular expression/],
    ['a key a component does not take', { box: { label: 'Box', form: 'container', body: 'blocks', look: 'wide' } }, /components\.box\.look: is no key of a component/],
  ]) {
    test(`refuses ${what}`, () => {
      assert.throws(() => siteDescription({ ...everyElement, components: declared }), problem);
    });
  }

  test('takes componentChecks as a module of the site repository, and only with components to check', () => {
    assert.equal(siteDescription(own({ componentChecks: 'checks/components.js' })).componentChecks, 'checks/components.js');
    assert.equal(siteDescription(own()).componentChecks, null);
    for (const path of ['/etc/checks.js', '../checks.js', 'checks.json']) {
      assert.throws(() => siteDescription(own({ componentChecks: path })), /componentChecks: must be the path of a JavaScript module/);
    }
    assert.throws(() => siteDescription({ ...everyElement, componentChecks: 'checks.js' }), /componentChecks: checks what the site's components hold, and the site declares none/);
  });

  test('gives the editor the components in Konzilo\'s own part of its configuration', () => {
    const config = cmsConfig(siteDescription(own()), { site: 'https://example.com', forgejo: 'https://git.example.com', repository: 'site/source', clientId: 'id' });
    assert.deepEqual(config.konzilo.components, siteDescription(own()).components);
    const bare = cmsConfig(siteDescription(everyElement), { site: 'https://example.com', forgejo: 'https://git.example.com', repository: 'site/source', clientId: 'id' });
    assert.equal(bare.konzilo.components, undefined);
  });

  test('leaves the core\'s rule data as it is', () => {
    const before = JSON.stringify(rules);
    withComponents(rules, siteDescription(own()).components);
    assert.equal(JSON.stringify(rules), before);
  });
});

describe('a body', () => {
  test('writes a container with its blocks, its fence a colon longer than the longest inside, and reads it back', () => {
    const body = '::breadcrumbs\n\n:::::section{surface="raised" anchor="hours"}\n\n::eyebrow[Opening *hours*]\n\n## Every day\n\n:::list\n- From 10 to 18\n:::\n\n:::::';
    const { refusals, text } = out(body);
    assert.deepEqual(refusals, []);
    assert.equal(text, pageFile('::breadcrumbs\n\n::::section{surface="raised" anchor="hours"}\n\n::eyebrow[Opening _hours_]\n\n## Every day\n\n:::list\n\n- From 10 to 18\n\n:::\n\n::::'));
    assert.equal(out(text.replace(/^---[\s\S]*?---\n\n/, '').trimEnd()).text, text);
  });

  test('leaves an attribute at its default out, and writes an empty container closed at once', () => {
    const { refusals, text } = out(':::section{surface="page"}\n:::');
    assert.deepEqual(refusals, []);
    assert.equal(text, pageFile(':::section\n:::'));
  });

  test('takes an image inside a container, as at the top of the body', () => {
    const result = run({ [pagePath]: pageSource(':::section\n\n![A lantern](media/lantern.jpg)\n\n:::'), 'media/lantern.jpg': Buffer.from('x') }, own());
    assert.deepEqual(result.refusals.filter((one) => !/lantern/.test(one.message)).map((one) => one.message), []);
  });

  for (const [what, body, reason] of [
    ['a value a component does not take', ':::section{surface="dark"}\nText\n:::', /the site cannot publish the setting "surface" with the value "dark"/],
    ['a value against its pattern, in the site\'s words', ':::section{anchor="Hours"}\nText\n:::', /"Hours" is no anchor; write lowercase letters and hyphens/],
    ['a label on a component with no text', '::breadcrumbs[Home]', /the site cannot publish the directive breadcrumbs with a label/],
    ['a leaf written as a container', ':::eyebrow\nText\n:::', /the site writes the directive eyebrow as ::eyebrow, on a line of its own/],
  ]) {
    test(`refuses ${what}`, () => {
      const { refusals } = out(body);
      assert.ok(refusals.some((one) => reason.test(one)), refusals.join('\n'));
    });
  }

  test('refuses an element inside a container that the type does not take', () => {
    const site = own();
    site.types = { page: { ...site.types.page, elements: site.types.page.elements.filter((element) => element !== 'code') } };
    const { refusals } = out(':::section\n\n```\ncode\n```\n\n:::', site);
    assert.ok(refusals.some((one) => /cannot hold a code block/.test(one)), refusals.join('\n'));
  });

  test('refuses a component a type does not take', () => {
    const site = own();
    site.types = { page: { ...site.types.page, elements: everyElement.types.page.elements.concat('section') } };
    const { refusals } = out('::eyebrow[Hello]', site);
    assert.ok(refusals.some((one) => /cannot hold eyebrow;/.test(one)), refusals.join('\n'));
  });
});

describe("the site's check of what its components hold", () => {
  const folders = [];
  after(() => {
    for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  });
  const checksIn = (source) => {
    const folder = mkdtempSync(join(tmpdir(), 'konzilo-component-checks-'));
    folders.push(folder);
    writeFileSync(join(folder, 'checks.js'), source);
    return componentChecksOf(siteDescription(own({ componentChecks: 'checks.js' })), folder);
  };
  const ONE_LIST = 'export function componentProblems(name, attributes, blocks) {\n  if (name !== "list") return [];\n  return blocks.filter((block) => block.type === "list").length === 1 ? [] : ["a series holds one list"];\n}\n';

  test('refuses a post for each reason the check gives, with the blocks the container holds', async () => {
    const components = await checksIn(ONE_LIST);
    const site = own({ componentChecks: 'checks.js' });
    assert.deepEqual(out(':::list\n- One\n:::', site, { components }).refusals, []);
    assert.ok(out(':::list\nNo list\n:::', site, { components }).refusals.some((one) => /a series holds one list/.test(one)));
  });

  test('asks only of the site\'s own components', async () => {
    const asked = await checksIn('export function componentProblems(name) {\n  return [`asked of ${name}`];\n}\n');
    assert.deepEqual(asked('form', {}, []), []);
    assert.deepEqual(asked('section', {}, []), ['asked of section']);
  });

  test('breaks the check for a module with no function, or one that gives no list of reasons', async () => {
    await assert.rejects(checksIn('export const nothing = 1;\n'), /exports no function componentProblems/);
    const wrong = await checksIn('export function componentProblems() {\n  return "no";\n}\n');
    assert.throws(() => wrong('section', {}, []), /gives no list of reasons for section/);
  });

  test('gives no check for a site that names none', async () => {
    assert.equal(await componentChecksOf(siteDescription(own()), tmpdir()), null);
  });
});

describe("the editor's early check", () => {
  const elements = siteDescription(own()).types.page.elements;
  after(() => useComponents({}));

  test('takes the components the configuration gives, and refuses them without', () => {
    const body = ':::section{surface="raised"}\n\n::eyebrow[Hello]\n\n:::';
    useComponents({});
    assert.ok(refusalsOf(body, handsFor(reader, { elements })).length > 0);
    useComponents(siteDescription(own()).components);
    assert.deepEqual(refusalsOf(body, handsFor(reader, { elements })), []);
  });
});
