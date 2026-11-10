// The body field's round trip, in a real browser and with no Compose, so that it stays
// fast (ADR 0014). For every fixture and every example of content-format.md: opening it in
// the field changes nothing, and after an edit and an undo the intake makes of it what it
// makes of the source. Expected bytes are written by hand. Keys are 20 ms apart at the least,
// since Milkdown's issues 2501 and 2506 misplace text typed faster.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { handsFor } from '../src/cms/body/check.js';
import { cmsConfig } from '../src/cms/config.js';
import { demoSource } from '../src/demo-source.js';
import { checkBody } from '../src/format/body.js';
import { reader } from '../src/intake/reader.js';
import { readSiteDescription, siteDescription } from '../src/site-description.js';
import { contentFormat, exampleFile, markedExamples } from '../tests/lib/content-format.js';
import { everyElement, pageFile, pagePath, pageSource, run, written } from '../tests/lib/intake.js';
import { ENGINES } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from 'satteri';
import { blockMarks } from '../src/astro/block-marks.js';
import { directiveReader } from '../src/astro/directives.js';
import { markdownFeatures, markdownHastPlugins } from '../src/astro/reader.js';

const fixturesRoot = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));
const core = fileURLToPath(new URL('../', import.meta.url));
const KEY_DELAY = 20;
const FORMS = ['contact', 'newsletter'];

const fixtures = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap(({ name: element }) => readdirSync(join(fixturesRoot, element))
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ name: `${element}/${file.slice(0, -'.md'.length)}`, body: readFileSync(join(fixturesRoot, element, file), 'utf8').replace(/\n$/, '') })));

const bodyOf = (contents) => contents.replace(/^---\n[\s\S]*?\n---\n\n?/, '').replace(/\n$/, '');
// The examples of the document's own site, which the field is set up for here; another
// site's, such as one with components of its own, are that site's.
const examples = markedExamples(contentFormat()).checked
  .filter((example) => ['markdown', 'md'].includes(example.language) && !example.attributes['site-description'] && !example.attributes.site)
  .map((example) => ({ name: `content-format.md line ${example.line}`, body: bodyOf(exampleFile(example).contents) }))
  .filter(({ body }) => body !== '');

const description = readSiteDescription(join(core, 'site-template/files/site-description.json'));
const demoBodies = demoSource(description, join(core, 'site-template/demo-content'))
  .filter(({ path }) => path.endsWith('.md'))
  .map(({ path, content }) => ({ name: `demo content ${path}`, body: bodyOf(content) }))
  .filter(({ body }) => body !== '');

// Source files other tools may have written, which the intake evens out and the field need
// not be the one to hold in any form but the meaning.
const OTHER_FORMS = [
  ['other bullets', '* One\n* Two', '- One\n- Two'],
  ['a plus', '+ One', '- One'],
  ['numbers as typed', '1. One\n1. Two\n1. Three', '1. One\n2. Two\n3. Three'],
  ['a setext heading', 'A heading\n---', '## A heading'],
  ['a closed heading', '## A heading ##', '## A heading'],
  ['other markers', '*Italic* and __bold__, ~one~', '_Italic_ and **bold**, ~~one~~'],
  ['raw marks that need none', '<strong>Bold</strong>, <em>italic</em> and <del>gone</del>', '**Bold**, _italic_ and ~~gone~~'],
  ['spaces in bold', 'A<strong> bold </strong>word', 'A **bold** word'],
  ['a non-breaking space by name', 'Ten&nbsp;kg', 'Ten\u00a0kg'],
  ['a character by name', 'Caf&eacute; &amp; b&#228;r', 'Café & bär'],
  ['a line break by spaces', 'One line  \nthe next', 'One line\\\nthe next'],
  ['a padded table', '| A    | B |\n|:----|---:|\n|  1   |  2 |', '| A | B |\n| :--- | ---: |\n| 1 | 2 |'],
  ['a table without its outer pipes', 'A | B\n--- | ---\n1 | 2', '| A | B |\n| --- | --- |\n| 1 | 2 |'],
  ['a tilde fence', '~~~\ncode\n~~~', '```\ncode\n```'],
  ['an indented code block', '    code', '```\ncode\n```'],
  ['a bare address in a sentence', 'See https://example.com today', 'See [https://example.com](https://example.com) today'],
  ['a colon typed bare', 'At 10:30 and :smile:', 'At 10\\:30 and :smile:'],
  ['a bare leaf that is no directive', '::note', '\\::note'],
  ['footnotes by name, out of order', 'One[^b] two[^a].\n\n[^a]: A.\n\n[^b]: B.', 'One[^1] two[^2].\n\n[^1]: B.\n\n[^2]: A.'],
  ['a citation with spaces', '> Words.\n>\n> <cite> Someone </cite>', '> Words.\n>\n> <cite>Someone</cite>'],
  ['an empty citation', '> Words.\n>\n> <cite></cite>', '> Words.'],
];

// What the writer cannot keep, which the field opens as Markdown, unchanged: a space at the
// edge of a link's or a strikethrough's run, which Milkdown moves out of the mark.
const OPENS_AS_MARKDOWN = new Set(['inline/link-spaces', 'strikethrough/space-at-the-edge']);

// Where marks wrap one text, the editor holds them in one order, which means the same on the
// page, so the intake's bytes differ from the fixture's by that alone.
const IN_ANOTHER_ORDER = new Map([
  ['inline/bold-and-italic', '**_Both_** and **_both_**'],
  ['internal-link/formats-in-link', 'Read [**the** _guide_](/a-guide/), or [**this one**](/a-guide/).'],
]);

// The intake, on one page's body: the page it writes, or why it refuses, without the lines
// a refusal names, which depend on how a body is spaced.
function intake(body) {
  const result = run({ [pagePath]: pageSource(body) }, everyElement);
  return result.refusals.length > 0 ? result.refusals.map((one) => one.message.replace(/, line \d+:/, ':')).join('\n') : written(result)['pages/hello-world.md'];
}

// Each block of a body as the live preview marks it, with the start of its text as the page's
// script takes it (src/astro/preview-link.js).
const NOT_WRITTEN = '[data-footnote-ref], [data-footnote-backref], .sr-only, .konzilo-embed, dialog';
function previewMarks(body) {
  const { html } = markdownToHtml(body, { features: markdownFeatures, mdastPlugins: [directiveReader(() => {})], hastPlugins: [...markdownHastPlugins, blockMarks] });
  const { document, NodeFilter } = new JSDOM(`<body>${html}</body>`).window;
  // A body's top-level blocks: a block within one, a list's item say, is found by its path.
  return [...document.querySelectorAll('[data-konzilo-block]')].filter((element) => !element.dataset.konziloBlock.includes('.')).map((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement.closest(NOT_WRITTEN)) text += node.data;
    return { block: Number(element.dataset.konziloBlock), count: 0, text: text.replace(/\s+/g, '').slice(0, 200) };
  });
}

describe('the body field, alone', () => {
  let site;
  let page;
  let seen;

  const call = (name, ...args) => page.evaluate(([method, values]) => globalThis.fieldPage[method](...values), [name, args]);

  const typeAtTheEnd = async (text) => {
    await call('focusEnd');
    await page.keyboard.type(text, { delay: KEY_DELAY });
    await call('flush');
  };

  // A new paragraph at the end, which leaves every block before it alone.
  const typeNewParagraph = async (mode, text) => {
    await call('focusEnd');
    if (mode === 'markdown' || !(await call('atEmptyBlock'))) await page.keyboard.press('Enter');
    if (mode === 'markdown') await page.keyboard.press('Enter');
    await page.keyboard.type(text, { delay: KEY_DELAY });
    await call('flush');
  };

  before(async () => {
    site = await openFieldPage();
    ({ page, seen } = await site.newPage());
  }, { timeout: 120_000 });

  after(() => site?.close());

  // Each test answers for the page errors it raises, not one test for all.
  afterEach(() => {
    assert.deepEqual(seen?.errors.splice(0) ?? [], []);
  });

  describe('a click in the preview', () => {
    test('leads each block the preview marks to that block, in every fixture and example', async () => {
      const missed = [];
      for (const { name, body } of [...fixtures, ...examples, ...demoBodies]) {
        if ((await call('open', body)) !== 'editor') continue;
        for (const mark of previewMarks(body)) {
          const index = await call('placeIndex', mark);
          if (index !== mark.block) missed.push(`${name}: block ${mark.block} led to ${index}, ${mark.text.slice(0, 30)}`);
        }
      }
      assert.deepEqual(missed, []);
    });

    test('puts the cursor at the character clicked, spaces aside', async () => {
      await call('open', 'One two\n\nThree four five');
      assert.equal(await call('goTo', { block: 1, count: 5, text: 'Threefourfive' }), true);
      await page.keyboard.type('X', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), 'One two\n\nThree Xfour five');
    });

    test('finds a block that has moved since the page was made, by its text', async () => {
      await call('open', 'New\n\nOne two\n\nThree four five');
      assert.equal(await call('goTo', { block: 1, count: 0, text: 'Threefourfive' }), true);
      await page.keyboard.type('X', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), 'New\n\nOne two\n\nXThree four five');
    });

    test('does nothing with a block it does not hold', async () => {
      await call('open', 'One two');
      assert.equal(await call('goTo', { block: 0, count: 0, text: 'Somethingelse' }), false);
      assert.equal(await call('goTo', { block: 5, count: 0, text: 'Onetwo' }), true, 'but finds its text where it stands');
    });

    test('chooses an embed whole, and goes into a list, a table and a caption', async () => {
      const body = 'One\n\nhttps://vimeo.com/76979871\n\n- First\n- Second item\n\n| A | B |\n| --- | --- |\n| Cell | Other |\n\n![A barn](/media/barn.webp)\\\nThe barn';
      await call('open', body);
      assert.equal(await call('goTo', { block: 1, count: 0, text: '' }), true);
      assert.equal(await page.locator('.konzilo-embed-field.ProseMirror-selectednode').count(), 1);
      for (const [place, typed, written] of [
        [{ block: 2, count: 6, text: 'FirstSeconditem' }, 'Z', '- First\n- SZecond item'],
        [{ block: 3, count: 5, text: 'ABCellOther' }, 'Z', '| CelZl | Other |'],
        [{ block: 4, count: 3, text: 'Thebarn' }, 'Z', 'The Zbarn'],
      ]) {
        await call('open', body);
        assert.equal(await call('goTo', place), true, JSON.stringify(place));
        await page.keyboard.type(typed, { delay: KEY_DELAY });
        await call('flush');
        assert.ok((await call('value')).includes(written), `${written} in ${await call('value')}`);
      }
    });
  });

  describe('every fixture and example', () => {
    for (const { name, body } of [...fixtures, ...examples, ...demoBodies]) {
      test(name, async () => {
        const inBrowser = await call('check', body, FORMS);
        const onServer = checkBody(body, handsFor(reader, { elements: everyElement.types.page.elements, forms: FORMS }));
        assert.deepEqual(inBrowser, { written: onServer.body, reasons: onServer.problems.map(({ reason }) => reason) }, 'the browser\'s check gives the intake\'s verdict');

        const mode = await call('open', body);
        assert.equal(mode, OPENS_AS_MARKDOWN.has(name) ? 'markdown' : 'editor', (await call('notes')).join(' '));

        // Focus, a click and a blur are no edits.
        await call('poke');
        assert.deepEqual(await call('changes'), [], 'opening and clicking change nothing');
        assert.equal(await call('value'), body);

        const reordered = IN_ANOTHER_ORDER.get(name);
        if (mode === 'editor') assert.equal(intake(await call('written')), reordered ? pageFile(reordered) : intake(body), 'the field writes what the source means');

        await typeNewParagraph(mode, 'zq');
        assert.equal(intake(await call('value')), intake(`${reordered ?? body}\n\nzq`), 'an edit keeps the rest of the body');

        await call('undoAll');
        assert.equal(await call('value'), body, 'an undo gives the bytes back');
      });
    }

  });

  describe('other forms of a source file open with their meaning', () => {
    for (const [name, body, exact] of OTHER_FORMS) {
      test(name, async () => {
        assert.equal(await call('open', body), 'editor', (await call('notes')).join(' '));
        await call('poke');
        assert.deepEqual(await call('changes'), []);
        assert.equal(await call('value'), body);
        assert.equal(intake(await call('written')), pageFile(exact));
      });
    }
  });

  // What an editor types that reads as syntax is text, in the file and on the page.
  describe('typed text that reads as syntax stays text', () => {
    for (const [typed, exact] of [
      ['::x', '\\::x'],
      [':::', '\\:::'],
      [':::note', '\\:::note'],
      ['# not a heading', '\\# not a heading'],
      ['#', '\\#'],
      ['1.', '1\\.'],
      ['| a | b |', '| a | b |'],
      ['---', '\\---'],
      ['At 10:30 and a:b', 'At 10\\:30 and a\\:b'],
      ['<b>not bold</b>', '\\<b>not bold\\</b>'],
      ['![an image](a.png)', '\\!\\[an image\\](a.png)'],
      ['[^1]: no footnote', '\\[^1\\]: no footnote'],
    ]) {
      test(typed, async () => {
        assert.equal(await call('open', ''), 'editor');
        await typeAtTheEnd(typed);
        assert.equal(intake(await call('value')), pageFile(exact));
      });
    }

    test('a colon right after a footnote\'s mark at a line start', async () => {
      await call('open', '[^1] x\n\n[^1]: The note.');
      await call('selectText', ' x');
      await page.keyboard.type(': two', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('[^1]\\: two\n\n[^1]: The note.'));
    });
  });

  describe('what is on offer', () => {
    test('## makes a heading, and # none', async () => {
      await call('open', '');
      await typeAtTheEnd('## Two');
      assert.equal(await call('value'), '## Two');
      await page.keyboard.press('Enter');
      await page.keyboard.type('### Three', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), '## Two\n\n### Three');
    });

    test('neither a key nor a line break makes what a heading cannot hold', async () => {
      await call('open', '## Two');
      await call('focusEnd');
      await page.keyboard.press('ControlOrMeta+Alt+1');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('x', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), '## Twox');
      await page.keyboard.press('ControlOrMeta+Alt+3');
      await call('flush');
      assert.equal(await call('value'), '### Twox');
    });

    test('backspace takes a heading to a paragraph, never to level 1', async () => {
      await call('open', '## Two');
      await call('focusParagraphStart', 0);
      await page.keyboard.press('Backspace');
      await call('flush');
      assert.equal(await call('value'), 'Two');
    });

    test('the block menu offers levels 2 to 6 and no separator, and a type\'s elements decide', async () => {
      await call('open', '');
      await typeAtTheEnd('/');
      await page.getByText('Heading 2').waitFor();
      const every = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(every.some((label) => label.includes('Heading 2')), every.join());
      assert.ok(every.some((label) => label.includes('Heading 6')), every.join());
      assert.ok(every.some((label) => label.includes('Table')), every.join());
      assert.ok(!every.some((label) => /Heading 1|Divider|Image|Math|Task/.test(label)), every.join());
      await call('open', '', { elements: ['paragraph', 'list'] });
      await typeAtTheEnd('/');
      await page.getByText('Bulleted list').waitFor();
      const few = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(few.some((label) => label.includes('Bulleted list')), few.join());
      assert.ok(!few.some((label) => /Heading|Quote|Code|Table/.test(label)), few.join());
    });

    test('a type that does not take an element keeps it as source, and offers no way to make one', async () => {
      const body = 'One\n\n## A heading\n\n> A quote\n\n| A |\n| --- |\n| 1 |';
      assert.equal(await call('open', body, { elements: ['paragraph'] }), 'editor');
      assert.equal(await page.locator('.konzilo-kept').count(), 3);
      await call('focusEnd');
      await page.keyboard.type('## x', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await page.locator('.ProseMirror h2').count(), 0);
      assert.match(await call('value'), /\\#\\# x|## x/);
      assert.equal((await call('value')).split('## A heading').length, 2);
    });

    test('the block handle stands inside the field, with a margin', async () => {
      for (const [body, block] of [['A paragraph', 'p'], ['## A heading', 'h2'], ['- An item', 'li'], ['> A quote', 'blockquote'], ['| A |\n| --- |\n| 1 |', 'td']]) {
        await call('open', body);
        await page.locator(`.ProseMirror ${block}`).first().hover();
        const handle = page.locator('.milkdown-block-handle[data-show="true"]');
        await handle.waitFor();
        const [box, frame] = await Promise.all([handle.boundingBox(), page.locator('.konzilo-body-visual').boundingBox()]);
        assert.ok(box.x >= frame.x + 4, `${body}: the handle starts ${box.x - frame.x} px inside the field`);
      }
    });

    test('text and a formatted run reach the file as the format has them', async () => {
      await call('open', '');
      await typeAtTheEnd('Plain bold plain');
      await call('selectText', 'bold');
      await page.keyboard.press('ControlOrMeta+b');
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('Plain **bold** plain'));
    });

    test('superscript, subscript and a non-breaking space', async () => {
      await call('open', '');
      await typeAtTheEnd('x2 H2O');
      await call('selectText', '2');
      await call('runMark', 'konzilo_superscript');
      await call('selectText', '2', 1);
      await call('runMark', 'konzilo_subscript');
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('x<sup>2</sup> H<sub>2</sub>O'));
      await call('open', 'Ten kg');
      await call('focusEnd');
      await page.keyboard.press('Control+Shift+Space');
      await page.keyboard.press('Meta+Shift+Space');
      await page.keyboard.type('x', { delay: KEY_DELAY });
      await call('flush');
      assert.match(await call('value'), /Ten kg +x/);
    });

    test('a list is tight, a quote takes a citation, and a code block has no language', async () => {
      await call('open', '');
      await typeAtTheEnd('- one');
      await page.keyboard.press('Enter');
      await page.keyboard.type('two', { delay: KEY_DELAY });
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => globalThis.fieldPage.atEmptyBlock());
      await page.keyboard.type('> Words', { delay: KEY_DELAY });
      await page.keyboard.press('Enter');
      await page.keyboard.type('Someone', { delay: KEY_DELAY });
      await call('runCommand', 'KonziloToggleCitation');
      await page.keyboard.press('Enter');
      await page.keyboard.type('After', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('- one\n- two\n\n> Words\n>\n> <cite>Someone</cite>\n\nAfter'));
    });

    test('a heading takes an anchor through its badge', async () => {
      await call('open', '## The start');
      await page.locator('.konzilo-anchor-badge').click();
      const anchor = page.locator('.konzilo-anchor-input');
      assert.notEqual(await anchor.evaluate((input) => getComputedStyle(input).caretColor), 'rgba(0, 0, 0, 0)', 'with a caret to write at');
      await anchor.fill('The Start');
      await anchor.press('Enter');
      assert.equal(await anchor.isVisible(), true, 'an anchor the format cannot hold is not taken');
      await anchor.fill('the-start');
      await anchor.press('Enter');
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('## <a id="the-start"></a>The start'));
    });

    test('a selection brings the toolbar, with the format\'s own marks', async () => {
      await call('open', 'Some text');
      await call('selectText', 'text');
      const superscript = page.locator('.milkdown-toolbar [aria-label="Superscript"]');
      await superscript.waitFor();
      await superscript.click();
      await call('flush');
      assert.equal(await call('value'), 'Some <sup>text</sup>');
      assert.equal(await page.locator('.milkdown-toolbar [aria-label="Footnote"]').count(), 1);
      await call('open', 'Some text', { elements: ['paragraph'] });
      await call('selectText', 'text');
      await page.locator('.milkdown-toolbar [aria-label="Bold"]').waitFor();
      assert.equal(await page.locator('.milkdown-toolbar [aria-label="Footnote"]').count(), 0);
    });

    test('a table takes text through a real click, and writes it unpadded', async () => {
      await call('open', '| A | B |\n| --- | --- |\n| 1 | 2 |');
      await page.locator('.ProseMirror td').last().click();
      // Long enough for anything Crepe would do a frame after a click.
      await page.waitForTimeout(100);
      await page.keyboard.type('3', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('| A | B |\n| --- | --- |\n| 1 | 23 |'));
    });

    test('text at a mark\'s edge keeps plain spaces, and a line break is a backslash', async () => {
      await call('open', '');
      await call('focusEnd');
      await page.keyboard.type('One ', { delay: KEY_DELAY });
      await page.keyboard.press('ControlOrMeta+b');
      await page.keyboard.type('two', { delay: KEY_DELAY });
      await page.keyboard.press('ControlOrMeta+b');
      await page.keyboard.type(' three', { delay: KEY_DELAY });
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('four', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), 'One **two** three\\\nfour');
    });

    test('a space at a block\'s edge or beside a line break stays out of the file', async () => {
      for (const [open, keys, exact] of [
        ['', ['word '], 'word'],
        ['', [' word'], 'word'],
        ['## Head', [' '], '## Head'],
        ['', ['a ', 'Shift+Enter', ' b'], 'a \\\nb'],
        ['', ['a ', 'ControlOrMeta+b', 'b '], 'a **b**'],
      ]) {
        await call('open', open);
        await call('focusEnd');
        for (const key of keys) {
          if (/\+/.test(key)) await page.keyboard.press(key);
          else await page.keyboard.type(key, { delay: KEY_DELAY });
        }
        await call('flush');
        assert.equal(await call('value'), exact);
      }
      await call('open', '');
      await call('focusEnd');
      await page.keyboard.type('word ', { delay: KEY_DELAY });
      await call('flush');
      await page.keyboard.type('more', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), 'word more', 'and typing goes on past the space');
    });

    test('backspace takes a citation to a paragraph in its quote, in no other form', async () => {
      await call('open', '> Words\n>\n> <cite>Someone</cite>');
      await call('focusParagraphStart', 1);
      await page.keyboard.press('Backspace');
      await call('flush');
      assert.equal(await call('value'), '> Words\n>\n> Someone');
    });

    test('text typed right after Enter lands where it is typed', async () => {
      await call('open', '');
      await call('focusEnd');
      await page.keyboard.type('- one', { delay: KEY_DELAY });
      for (const word of ['two', 'three', 'four']) {
        await page.keyboard.press('Enter');
        await page.keyboard.type(word);
      }
      await call('flush');
      assert.equal(await call('value'), '- one\n- two\n- three\n- four');
    });

    test('a footnote goes in as a mark and a text, and they leave together', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await call('runCommand', 'KonziloInsertFootnote');
      await page.keyboard.type('The note', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('One[^1]\n\n[^1]: The note'));
      await call('focusParagraphEnd', 0);
      await page.keyboard.press('Backspace');
      await call('flush');
      assert.equal(await call('value'), 'One');
    });
  });

  describe('pasting', () => {
    test('HTML with a script, an image and an h1 is reduced', async () => {
      await call('open', '');
      await call('paste', { html: '<h1>A title</h1><p>Some <strong>bold</strong><img src="x.png" alt="y"> text<script>globalThis.pwned = true</script></p><hr><div onclick="pwned = true">More</div>' });
      await call('flush');
      assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
      assert.equal(intake(await call('value')), pageFile('## A title\n\nSome **bold** text\n\nMore'));
      // The handler is only read, in a document of its own, and the policy says so.
      assert.match(seen.refused.splice(0).join(), /inline event handler/);
    });

    test('Markdown as plain text is reduced too, and nothing becomes a kept block', async () => {
      await call('open', '');
      await call('paste', { text: '# A title\n\n---\n\n![a](b.png)\n\n<div>raw</div>\n\nA paragraph' });
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('## A title\n\nA paragraph'));
      assert.equal(await page.locator('.konzilo-kept').count(), 0);
    });

    test('a block copied within the field comes through whole', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await call('paste', { html: '<div data-pm-slice="0 0 []"><div data-konzilo-kept="" data-kind="image" data-value="![a](/media/a.webp)"><pre>![a](/media/a.webp)</pre></div></div>' });
      await call('flush');
      assert.equal(await call('value'), 'One\n\n![a](/media/a.webp)');
      await call('open', 'One');
      await call('focusEnd');
      await call('paste', { html: '<div data-konzilo-kept="" data-kind="html" data-value="<div>raw</div>"><pre>raw</pre></div>' });
      await call('flush');
      assert.deepEqual(await call('changes'), [], 'from anywhere else, it is no kept block');
    });

    test('in a table\'s cell, what is pasted is one line, and the table stays as it was', async () => {
      const table = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      for (const [what, exact] of [
        [{ text: 'First para\n\nSecond para' }, '2First para Second para'],
        [{ html: '<p>First <strong>bold</strong></p><p>Second</p>' }, '2First **bold** Second'],
        [{ html: '<ul><li>a</li><li>b</li></ul>' }, '2a b'],
        [{ text: 'One\\\ntwo' }, '2One two'],
        [{ text: 'word' }, '2word'],
        [{ html: '<table><tr><th>X</th><th>Y</th></tr><tr><td>Z</td><td>W</td></tr></table>' }, '2X Y Z W'],
      ]) {
        await call('open', table);
        await page.locator('.ProseMirror td').last().click();
        await page.waitForTimeout(50);
        await call('paste', what);
        await call('flush');
        assert.equal(intake(await call('value')), pageFile(`| A | B |\n| --- | --- |\n| 1 | ${exact} |`));
        assert.deepEqual(await call('tablesAndCells'), [1, 4]);
      }
    });

    test('a pasted numbered list starts at 1, which is all the site can publish', async () => {
      await call('open', '');
      await call('paste', { html: '<ol start="5"><li>Five</li><li>Six</li></ol>' });
      await call('flush');
      assert.equal(await call('value'), '1. Five\n2. Six');
    });

    test('what a type does not take comes as its text', async () => {
      await call('open', '', { elements: ['paragraph'] });
      await call('paste', { text: '## A title\n\n> A quote\n\n- An item' });
      await call('flush');
      assert.equal(intake(await call('value')), pageFile('A title\n\nA quote\n\nAn item'));
    });
  });

  describe('nothing writes but a real edit', () => {
    test('an empty body stays empty, also through empty paragraphs', async () => {
      await call('open', '');
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await call('flush');
      assert.deepEqual(await call('changes'), []);
    });

    test('CRLF and trailing spaces in a source file open and stay', async () => {
      const body = 'One line\\\r\nthe next  \r\n\r\n## A heading   \r\n\r\n- One  \r\n- Two\r\n';
      assert.equal(await call('open', body), 'editor');
      await call('poke');
      assert.deepEqual(await call('changes'), []);
      assert.equal(await call('value'), body);
      await typeAtTheEnd('zq');
      assert.equal(intake(await call('value')), pageFile('One line\\\nthe next\n\n## A heading\n\n- One\n- Two\n\nzq'));
    });

    test('a remount changes nothing and keeps the undo', async () => {
      const body = 'One **two**\n\n> Three';
      await call('open', body);
      await typeAtTheEnd('zq');
      await call('remount');
      assert.equal(await call('mode'), 'editor');
      assert.match(await call('value'), /zq$/);
      await call('undoAll');
      assert.equal(await call('value'), body);
      await call('remount');
      assert.deepEqual((await call('changes')).at(-1), body);
    });

    test('what it wrote itself, coming back after the next key, leaves the editor alone', async () => {
      await call('open', '', { answering: true });
      await call('focusEnd');
      await call('sameEditorAs', true);
      await page.keyboard.type('a', { delay: KEY_DELAY });
      await call('flush');
      await page.keyboard.type('b', { delay: KEY_DELAY });
      await call('answer');
      assert.equal(await call('sameEditorAs'), true, 'the editor was not opened anew');
      await page.keyboard.type('c', { delay: KEY_DELAY });
      await call('flush');
      await call('answer');
      assert.equal(await call('value'), 'abc');
      assert.equal(await call('sameEditorAs'), true);
    });

    test('what it wrote itself, coming back after the next key, leaves the Markdown alone', async () => {
      await call('open', 'x', { answering: true });
      await page.getByRole('button', { name: 'Show Markdown' }).click();
      const source = page.locator('.konzilo-body-source');
      await source.press('End');
      await page.keyboard.type('ab', { delay: KEY_DELAY });
      await call('answer');
      await page.keyboard.type('c', { delay: KEY_DELAY });
      assert.equal(await source.inputValue(), 'xabc');
      await call('answer');
      assert.equal(await source.inputValue(), 'xabc');
      assert.equal(await call('value'), 'xabc');
    });

    test('a value from outside, while its own are on their way back, still opens anew', async () => {
      await call('open', '', { answering: true });
      await call('focusEnd');
      await page.keyboard.type('a', { delay: KEY_DELAY });
      await call('flush');
      await call('setValue', 'From outside');
      await call('settled');
      assert.equal(await call('written'), 'From outside');
      assert.equal(await call('value'), 'From outside');
    });

    test('a value from outside opens anew, and writes nothing', async () => {
      await call('open', 'One');
      await call('setValue', 'Two');
      await call('settled');
      assert.deepEqual(await call('changes'), []);
      assert.equal(await call('written'), 'Two');
    });
  });

  describe('the way out', () => {
    test('a toggle shows the Markdown, which an edit there changes, and goes back', async () => {
      await call('open', 'One **two**');
      await page.getByRole('button', { name: 'Show Markdown' }).click();
      const source = page.locator('.konzilo-body-source');
      assert.equal(await source.inputValue(), 'One **two**');
      assert.deepEqual(await call('changes'), []);
      await source.press('End');
      await page.keyboard.type(' three', { delay: KEY_DELAY });
      assert.equal(await call('value'), 'One **two** three');
      await page.getByRole('button', { name: 'Show the editor' }).click();
      await call('settled');
      assert.equal(await call('mode'), 'editor');
      assert.equal(await page.locator('.ProseMirror strong').textContent(), 'two');
      assert.equal((await call('changes')).at(-1), 'One **two** three');
    });

    test('a value the writer would change opens as Markdown and says why', async () => {
      const body = 'The<del> struck</del> space';
      assert.equal(await call('open', body), 'markdown');
      assert.equal(await page.locator('.konzilo-body-source').inputValue(), body);
      assert.match((await call('notes')).join(), /would change a paragraph \(block 1\)/);
      assert.deepEqual(await call('changes'), []);
    });

    test('says so in a Swedish browser', async () => {
      const swedish = await site.newPage({ language: 'sv-SE' });
      try {
        const body = 'The<del> struck</del> space';
        assert.equal(await swedish.page.evaluate((value) => globalThis.fieldPage.open(value), body), 'markdown');
        assert.match((await swedish.page.evaluate(() => globalThis.fieldPage.notes())).join(), /skulle ändra ett stycke \(block 1\)/);
        await swedish.page.getByRole('button', { name: 'Visa redigeraren' }).waitFor();
      } finally {
        await swedish.context.close();
      }
    });

    test('later elements stay as they are, as kept blocks, around an edit', async () => {
      const body = 'First\n\n![One](/media/a.webp)\n![Two](/media/b.webp)\n\nhttps://vimeo.com/76979871\n\n::form{name="contact"}\n\n<table>\n<caption>A caption</caption>\n<thead>\n<tr><th>A</th></tr>\n</thead>\n</table>\n\n:::unknown\nInside\n\nmore\n:::\n\nLast';
      assert.equal(await call('open', body), 'editor');
      assert.equal(await page.locator('.konzilo-kept').count(), 3);
      await typeAtTheEnd(' zq');
      assert.equal(await call('value'), `${body} zq`);
    });

    test('a container without a closing fence stays source to the end, as the reader reads it', async () => {
      const body = 'First\n\n:::note\nNever closed\n\nThe rest';
      assert.equal(await call('open', body), 'editor', (await call('notes')).join(' '));
      assert.equal(await page.locator('.konzilo-kept').count(), 1);
      await call('poke');
      assert.deepEqual(await call('changes'), []);
    });

    test('a later element inside another opens as Markdown, unchanged', async () => {
      const body = '- An item with ![an image](/media/a.webp) in it';
      await call('open', body);
      assert.equal(await call('value'), body);
      assert.deepEqual(await call('changes'), []);
    });
  });

  describe('an image', () => {
    const BARN = '![A red barn](/media/barn.webp)';
    const LIBRARY = { entries: [{ src: '/media/lantern.webp', alt: 'A lantern at dusk', caption: 'The quay' }, { src: '/media/no-picture.webp', alt: 'A lake', caption: '' }] };
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');
    const chooser = () => page.getByRole('dialog', { name: 'Choose an image' });
    const editing = () => page.getByRole('dialog', { name: 'Edit the image' });
    const altField = () => editing().getByRole('textbox', { name: 'Alt text' });
    const startEditing = async (index = 0) => {
      await page.getByRole('button', { name: 'Edit the image' }).nth(index).click();
      await editing().waitFor();
    };
    const done = async () => {
      await editing().getByRole('button', { name: 'Done' }).click();
      await editing().waitFor({ state: 'detached' });
    };
    const setAlt = async (alt, index = 0) => {
      await startEditing(index);
      await altField().fill(alt);
      await done();
    };
    const altIs = async (index = 0) => (await call('images'))[index].alt;
    const TRANSPARENT = 'rgba(0, 0, 0, 0)';
    const openMenu = async () => {
      await call('focusEnd');
      if (!(await call('atEmptyBlock'))) await page.keyboard.press('Enter');
      await page.keyboard.type('/image', { delay: KEY_DELAY });
      // The menu narrows a moment after the keys, and Enter takes the row it marks.
      await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Image' }).waitFor();
      await page.keyboard.press('Enter');
      await chooser().waitFor();
    };

    test('opens as a picture with its texts, and changes nothing', async () => {
      const body = `${BARN}\\\nThe barn _in 1920_`;
      assert.equal(await call('open', body, { library: LIBRARY }), 'editor', (await call('notes')).join(' '));
      assert.deepEqual(await call('images'), [{ src: '/media/barn.webp', alt: 'A red barn', caption: 'The barn in 1920' }]);
      assert.equal(await page.locator('.konzilo-kept').count(), 0);
      assert.equal(await page.locator('.konzilo-image input').count(), 0, 'no field stands in the flow');
      assert.equal(await page.locator('.konzilo-image-picture img').getAttribute('alt'), 'A red barn');
      assert.equal(await page.locator('.konzilo-image-caption em').textContent(), 'in 1920');
      await page.locator('.konzilo-image-picture[data-state="shown"] img').waitFor();
      await call('poke');
      assert.deepEqual(await call('changes'), []);
      assert.equal(await call('value'), body);
    });

    test('shows that it has no picture to show, and goes on', async () => {
      assert.equal(await call('open', '![A lake](/media/no-picture.webp)', { library: LIBRARY }), 'editor');
      await page.locator('.konzilo-image-picture[data-state="none"]').waitFor();
      assert.equal(await page.locator('.konzilo-image-words').textContent(), 'A lake', 'and says what it would have shown');
      assert.equal(await call('open', BARN), 'editor', 'and with no library at all');
      await page.locator('.konzilo-image-picture[data-state="none"]').waitFor();
      assert.equal(await page.locator('.konzilo-image-words').textContent(), 'A red barn');
    });

    test('has its alt text in a dialog from a button on the picture, with a caret to write at', async () => {
      await call('open', BARN, { library: LIBRARY });
      await page.locator('.konzilo-image-picture[data-state="shown"] img').waitFor();
      await startEditing();
      assert.equal(await editing().locator('img').evaluate((image) => image.decode().then(() => image.naturalWidth > 0)), true, 'with the picture to describe');
      assert.equal(await altField().inputValue(), 'A red barn');
      assert.equal(await altField().evaluate((input) => document.activeElement === input), true);
      assert.notEqual(await altField().evaluate((input) => getComputedStyle(input).caretColor), TRANSPARENT);
      await page.keyboard.press('End');
      await page.keyboard.type(' at dusk', { delay: KEY_DELAY });
      assert.equal(await altIs(), 'A red barn', 'nothing changes before it is done');
      await done();
      await call('flush');
      assert.equal(await call('value'), '![A red barn at dusk](/media/barn.webp)');
      assert.equal(await page.locator('.konzilo-image-picture img').getAttribute('alt'), 'A red barn at dusk');
    });

    test('takes Enter in the dialog as done, and the whole change as one undo', async () => {
      await call('open', BARN);
      await startEditing();
      await altField().fill('  A barn in the snow ');
      await altField().press('Enter');
      await editing().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal(await call('value'), '![A barn in the snow](/media/barn.webp)', 'without the spaces at its edges');
      await call('undoAll');
      assert.equal(await call('value'), BARN);
    });

    test('changes nothing when the dialog is left, whichever way', async () => {
      await call('open', BARN);
      for (const leave of [() => page.keyboard.press('Escape'), () => editing().getByRole('button', { name: 'Cancel' }).click()]) {
        await startEditing();
        await altField().fill('Something else');
        await leave();
        await editing().waitFor({ state: 'detached' });
        assert.equal(await altIs(), 'A red barn');
      }
      await startEditing();
      await done();
      await call('poke');
      assert.deepEqual(await call('changes'), [], 'and done with nothing changed is no change');
      assert.equal(await call('value'), BARN);
    });

    test('goes back to writing where the cursor was when the dialog closes', async () => {
      await call('open', `Before\n\n${BARN}`);
      await call('focusEnd');
      await page.keyboard.type('Written', { delay: KEY_DELAY });
      await setAlt('Another barn');
      await page.keyboard.type(' on', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), 'Before\n\n![Another barn](/media/barn.webp)\n\nWritten on');
    });

    test('in the dialog, takes no blank alt text', async () => {
      await call('open', BARN);
      await startEditing();
      await altField().fill('   ');
      await editing().getByRole('button', { name: 'Done' }).click();
      await editing().getByRole('alert').waitFor();
      assert.match(await editing().getByRole('alert').textContent(), /Describe the image/);
      assert.equal(await altField().getAttribute('aria-invalid'), 'true');
      assert.equal(await altField().evaluate((input) => document.activeElement === input), true);
      await altField().fill('A barn');
      await done();
      assert.equal(await altIs(), 'A barn');
    });

    test('comes out only when asked twice, and back with undo', async () => {
      const body = `One\n\n${BARN}\n\nTwo`;
      await call('open', body);
      await startEditing();
      await altField().fill('Typed before thinking again');
      await editing().getByRole('button', { name: 'Remove the image' }).click();
      const keep = editing().getByRole('button', { name: 'Keep the image' });
      await keep.waitFor();
      assert.match(await editing().textContent(), /Remove this image from the text\?/);
      assert.match(await editing().textContent(), /image library stays as it is/);
      assert.equal(await keep.evaluate((element) => document.activeElement === element), true, 'with the safe answer in hand');
      assert.equal((await call('images')).length, 1, 'still there');

      await keep.click();
      assert.equal(await altField().inputValue(), 'Typed before thinking again', 'back with what was typed');
      await editing().getByRole('button', { name: 'Remove the image' }).click();
      await page.keyboard.press('Escape');
      await altField().waitFor();
      assert.equal(await editing().isVisible(), true, 'Escape takes one step back');
      assert.equal(await altField().inputValue(), 'Typed before thinking again');

      await editing().getByRole('button', { name: 'Remove the image' }).click();
      await editing().getByRole('button', { name: 'Remove', exact: true }).click();
      await editing().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal(await call('value'), 'One\n\nTwo');
      await call('undoAll');
      assert.equal(await call('value'), body);
    });

    test('takes a change to its caption, with what a caption may hold', async () => {
      await call('open', BARN);
      await call('focusCaption');
      await page.keyboard.type('The barn', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), `${BARN}\\\nThe barn`);
      await call('selectText', 'barn');
      for (const mark of ['strong', 'emphasis', 'inlineCode', 'konzilo_superscript', 'konzilo_subscript']) {
        await call('runMark', mark);
        await call('runMark', mark);
      }
      await call('runMark', 'emphasis');
      await call('flush');
      assert.equal(await call('value'), `${BARN}\\\nThe _barn_`);
      assert.deepEqual((await call('check', await call('value'), FORMS)).reasons, []);
    });

    test('has one line of caption: Enter leaves it, and a line break is none of its', async () => {
      await call('open', `${BARN}\\\nOne`);
      await call('focusCaption');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('X', { delay: KEY_DELAY });
      await page.keyboard.press('Enter');
      await page.keyboard.type('After', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), `${BARN}\\\nOneX\n\nAfter`);
    });

    test('stays an image whatever is typed or pressed in its caption', async () => {
      for (const typed of ['## ', '- ', '> ', '1. ', '``` ', '| a |']) {
        await call('open', BARN);
        await call('focusCaption');
        await page.keyboard.type(typed, { delay: KEY_DELAY });
        assert.deepEqual((await call('topBlocks')).slice(0, 1), ['konzilo_image'], typed);
      }
      for (const key of ['Control+Alt+2', 'Control+Alt+0', 'Control+Alt+c', 'Meta+Alt+2', 'Meta+Alt+0', 'Meta+Alt+c']) {
        await call('open', BARN);
        await call('focusCaption');
        await page.keyboard.press(key);
        assert.deepEqual((await call('topBlocks')).slice(0, 1), ['konzilo_image'], key);
      }
    });

    test('stays an image when a selection that takes it in is made a heading', async () => {
      const body = `One\n\n${BARN}\\\nIts caption\n\nTwo`;
      await call('open', body);
      await call('selectAll');
      for (const key of ['Control+Alt+2', 'Meta+Alt+2', 'Control+Alt+c', 'Meta+Alt+c']) await page.keyboard.press(key);
      await call('flush');
      assert.ok((await call('topBlocks')).includes('konzilo_image'));
      assert.equal((await call('images'))[0].caption, 'Its caption');
    });

    test('opens no block menu in its caption', async () => {
      await call('open', BARN, { library: LIBRARY });
      await call('focusCaption');
      await page.keyboard.type('/im', { delay: KEY_DELAY });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.milkdown-slash-menu[data-show="true"]').count(), 0);
    });

    test('writes what would read as something else so that it reads back the same', async () => {
      for (const alt of ['A *starred* [boxed] barn_ish & `ticks` \\ <b>x</b> &copy; 1 ~ 2 ~~old~~', 'At 10:30 :smile: ::x', 'www.example.com or https://example.com', '![inner](x)']) {
        await call('open', BARN);
        await setAlt(alt);
        await call('flush');
        const value = await call('value');
        const read = await call('check', value, FORMS);
        assert.deepEqual(read.reasons, [], `${alt}: ${value}`);
        await call('open', value);
        assert.equal(await altIs(), alt, value);
      }
      for (const caption of ['# not a heading', '- not an item', '> not a quote', '2024. A year', '![not](an-image.webp)', 'www.example.com, https://example.com and a@example.com', '10:30', '2 * 3 _ 4 ` 5', '::x', '<b>x</b>', '[a](b)']) {
        await call('open', BARN);
        await call('focusCaption');
        await page.keyboard.type(caption, { delay: 5 });
        await call('flush');
        const value = await call('value');
        const read = await call('check', value, FORMS);
        assert.deepEqual(read.reasons, [], `${caption}: ${value}`);
        assert.equal(await call('open', value), 'editor', `${caption}: ${value}`);
        assert.deepEqual(await call('images'), [{ src: '/media/barn.webp', alt: 'A red barn', caption }], value);
      }
    });

    test('has a caption of spaces as no caption', async () => {
      await call('open', BARN);
      await call('focusCaption');
      await page.keyboard.type('   ', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('written'), BARN);
    });

    test('without alt text, says so on the picture, and is refused at Save by the field and the intake alike', async () => {
      const bare = '![](/media/barn.webp)';
      assert.equal(await call('open', bare), 'editor');
      const missing = page.locator('.konzilo-image-words[data-missing]');
      assert.equal(await missing.textContent(), 'No alt text yet');
      assert.equal(await call('value'), bare);
      assert.match((await call('check', bare, FORMS)).reasons.join(), /without alt text/);
      await setAlt('A red barn');
      assert.equal(await missing.count(), 0);
      await call('flush');
      assert.equal(await call('value'), BARN);
    });

    test('keeps what is no image the field can hold as source, for the check to speak of', async () => {
      for (const [body, why] of [['![A](/media/a.webp "A title")', /title/], ['![A](/media/a.webp)\\\nWith [a link](/x/)', /./], ['![A](/media/a.webp)\nOn the next line', /./], ['Text with ![A](/media/a.webp) in it', /alone/], ['![A](/media/a.webp)\\\nOne\\\nTwo', /./]]) {
        assert.equal(await call('open', body), 'editor', body);
        assert.equal(await page.locator('.konzilo-kept').count(), 1, body);
        assert.deepEqual(await call('images'), [], body);
        assert.equal(await call('value'), body);
        assert.match((await call('check', body, FORMS)).reasons.join(), why, body);
      }
    });

    test('where a type does not take images, stays source and is not on offer', async () => {
      assert.equal(await call('open', `One\n\n${BARN}`, { elements: ['paragraph', 'code'], library: LIBRARY }), 'editor');
      assert.equal(await page.locator('.konzilo-kept').count(), 1);
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li').first().waitFor();
      const offered = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(!offered.some((label) => label.includes('Image')), offered.join());
    });

    test('is not on offer without a library', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li').first().waitFor();
      const offered = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(!offered.some((label) => label.includes('Image')), offered.join());
    });

    test('moves with the block handle, whole', async () => {
      await call('open', `${BARN}\\\nIts caption\n\nThe paragraph`);
      await page.locator('.konzilo-image-picture').hover();
      const handle = page.locator('.milkdown-block-handle[data-show="true"] .operation-item').last();
      await handle.waitFor();
      const from = await handle.boundingBox();
      const to = await page.locator('.ProseMirror p', { hasText: 'The paragraph' }).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 8 });
      await page.mouse.move(to.x + 40, to.y + to.height, { steps: 4 });
      await page.mouse.up();
      await call('flush');
      assert.equal(await call('value'), `The paragraph\n\n${BARN}\\\nIts caption`);
      // A drag's last events come a moment after, and a person is not gone that soon.
      await page.waitForTimeout(100);
    });

    test('from outside does not come along in a paste, and in its own field it does', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await call('paste', { html: '<figure data-konzilo-image data-src="https://elsewhere.example/a.png" data-alt="Forged"><figcaption>Forged</figcaption></figure>' });
      assert.deepEqual(await call('images'), []);
      await call('open', 'One');
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await call('paste', { html: '<div data-pm-slice="0 0 []"><figure data-konzilo-image data-src="/media/a.webp" data-alt="Mine"><figcaption>Its text</figcaption></figure></div>' });
      assert.deepEqual(await call('images'), [{ src: '/media/a.webp', alt: 'Mine', caption: 'Its text' }]);
    });

    test('keeps its caption to one line of what it takes when something is pasted there', async () => {
      await call('open', BARN);
      await call('focusCaption');
      await call('paste', { text: '# Head\n\nA [link](/x/) and **bold**\n\n- item' });
      await call('flush');
      assert.deepEqual(await call('topBlocks').then((blocks) => blocks.slice(0, 1)), ['konzilo_image']);
      assert.equal(await page.locator('.konzilo-image-caption a').count(), 0);
      assert.equal(await page.locator('.konzilo-image-caption strong').textContent(), 'bold');
      assert.equal((await call('check', await call('value'), FORMS)).reasons.length, 0);
      await call('open', BARN);
      await call('focusCaption');
      await call('paste', { html: '<p>Some <a href="https://example.com/">linked</a> <em>text</em></p><p>And more</p>' });
      assert.equal(await page.locator('.konzilo-image-caption a').count(), 0);
      assert.equal((await call('images'))[0].caption, 'Some linked text And more');
    });

    describe('from the library, with /image', () => {
      test('lists it, and copies the choice\'s texts in, in place of what was typed', async () => {
        const held = LIBRARY.entries.map((entry) => ({ ...entry }));
        await call('open', 'One', { library: { entries: held } });
        await openMenu();
        const items = chooser().locator('.konzilo-chooser-item');
        await items.first().waitFor();
        assert.deepEqual(await items.allTextContents(), ['A lantern at dusk', 'A lake']);
        await chooser().getByRole('button', { name: 'A lantern at dusk' }).click();
        await chooser().waitFor({ state: 'detached' });
        assert.deepEqual(await call('images'), [{ src: '/media/lantern.webp', alt: 'A lantern at dusk', caption: 'The quay' }]);
        await page.keyboard.type('Then more', { delay: KEY_DELAY });
        await call('flush');
        assert.equal(await call('value'), 'One\n\n![A lantern at dusk](/media/lantern.webp)\\\nThe quay\n\nThen more');
      });

      test('leaves the choice\'s texts free to change in the post', async () => {
        await call('open', '', { library: LIBRARY });
        await openMenu();
        await chooser().getByRole('button', { name: 'A lantern at dusk' }).click();
        await setAlt('The lantern, closer');
        await call('flush');
        assert.equal(await call('value'), '![The lantern, closer](/media/lantern.webp)\\\nThe quay');
      });

      test('finds by alt text and caption, and says when nothing matches', async () => {
        await call('open', '', { library: LIBRARY });
        await openMenu();
        const search = chooser().getByRole('searchbox');
        const visible = () => chooser().locator('.konzilo-chooser-item:visible span').allTextContents();
        await chooser().locator('.konzilo-chooser-item').first().waitFor();
        await search.fill('QUAY');
        assert.deepEqual(await visible(), ['A lantern at dusk']);
        await search.fill('lake');
        assert.deepEqual(await visible(), ['A lake']);
        await search.fill('nothing like it');
        assert.deepEqual(await visible(), []);
        await chooser().getByText('No image in the library matches.').waitFor();
        await page.keyboard.press('Escape');
      });

      test('at Escape, or Close, puts nothing in, and the field writes nothing', async () => {
        await call('open', 'One', { library: LIBRARY });
        await openMenu();
        await page.keyboard.press('Escape');
        await chooser().waitFor({ state: 'detached' });
        await openMenu();
        await chooser().getByRole('button', { name: 'Close' }).click();
        await chooser().waitFor({ state: 'detached' });
        await call('flush');
        assert.deepEqual(await call('images'), []);
        assert.equal(await call('value'), 'One');
      });

      test('says so when the library is empty, or cannot be read, and can try again', async () => {
        await call('open', '', { library: { entries: [] } });
        await openMenu();
        await chooser().getByText('The library holds no images yet.').waitFor();
        await page.keyboard.press('Escape');
        await call('open', '', { library: { entries: LIBRARY.entries, throwing: { list: true } } });
        await openMenu();
        await chooser().getByText('The library could not be read just now.').waitFor();
        await call('stopThrowing');
        await chooser().getByRole('button', { name: 'Try again' }).click();
        await chooser().getByRole('button', { name: 'A lake' }).waitFor();
        await page.keyboard.press('Escape');
      });

      test('after a block with something in it, goes after that block', async () => {
        await call('open', '> A quote', { library: LIBRARY });
        await call('focusEnd');
        await page.keyboard.press('Enter');
        await page.keyboard.type('/image', { delay: KEY_DELAY });
        await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Image' }).waitFor();
        await page.keyboard.press('Enter');
        await chooser().getByRole('button', { name: 'A lake' }).click();
        await call('flush');
        const value = await call('value');
        assert.equal((await call('check', value, FORMS)).reasons.length, 0, value);
        assert.ok(value.includes('![A lake](/media/no-picture.webp)'), value);
        assert.deepEqual(await call('topBlocks').then((blocks) => blocks.includes('konzilo_image')), true);
      });
    });

    describe('uploaded in the chooser', () => {
      const upload = async (file = { name: 'A new one.png', mimeType: 'image/png', buffer: PNG }) => {
        await chooser().getByRole('button', { name: 'Upload a new image' }).click();
        await chooser().locator('input[type=file]').setInputFiles(file);
      };

      test('joins the library and becomes the choice, with the texts given', async () => {
        await call('open', '', { library: LIBRARY });
        await openMenu();
        await upload();
        await chooser().getByRole('textbox', { name: 'Alt text' }).fill(' A new one ');
        await chooser().getByRole('textbox', { name: 'Caption' }).fill(' Its caption ');
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().waitFor({ state: 'detached' });
        assert.deepEqual(await call('added'), [{ name: 'A new one.png', size: PNG.length, alt: ' A new one ', caption: ' Its caption ' }]);
        assert.deepEqual(await call('images'), [{ src: '/media/A new one.png', alt: 'A new one', caption: 'Its caption' }]);
      });

      test('needs a file and an alt text, and adds nothing until it has them', async () => {
        await call('open', '', { library: LIBRARY });
        await openMenu();
        await chooser().getByRole('button', { name: 'Upload a new image' }).click();
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().getByText('Choose a file first.').waitFor();
        await chooser().locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().getByText('Describe the image for those who cannot see it.').waitFor();
        assert.deepEqual(await call('added'), []);
        await page.keyboard.press('Escape');
      });

      test('turns away what the site would, in the site\'s words, whatever the file is called', async () => {
        const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        const cases = [
          [{ name: 'moving.png', mimeType: 'image/png', buffer: gif }, /cannot use a GIF/],
          [{ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('just some words') }, /cannot use this file/],
          [{ name: 'small.png', mimeType: 'image/png', buffer: PNG }, /1 pixels wide.*none narrower than 400/],
        ];
        await call('open', '', { library: LIBRARY, smallestWidth: 400 });
        await openMenu();
        await chooser().getByRole('button', { name: 'Upload a new image' }).click();
        for (const [file, words] of cases) {
          await chooser().locator('input[type=file]').setInputFiles(file);
          await chooser().getByRole('textbox', { name: 'Alt text' }).fill('Something');
          await chooser().getByRole('button', { name: 'Upload and use' }).click();
          await chooser().getByRole('alert').filter({ hasText: words }).waitFor();
        }
        assert.deepEqual(await call('added'), []);
        await page.keyboard.press('Escape');
      });

      test('keeps what was filled in when the upload fails, and can be tried again', async () => {
        await call('open', '', { library: { entries: [], throwing: { add: true } } });
        await openMenu();
        await upload();
        const alt = chooser().getByRole('textbox', { name: 'Alt text' });
        await alt.fill('Kept');
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().getByText('The image could not be uploaded just now.').waitFor();
        assert.equal(await alt.inputValue(), 'Kept');
        await call('stopThrowing');
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().waitFor({ state: 'detached' });
        assert.equal((await call('images'))[0].alt, 'Kept');
      });

      test('can go back to the library', async () => {
        await call('open', '', { library: LIBRARY });
        await openMenu();
        await upload();
        await chooser().getByRole('button', { name: 'Back to the library' }).click();
        await chooser().getByRole('button', { name: 'A lake' }).click();
        assert.equal((await call('images'))[0].alt, 'A lake');
      });
    });
  });

  describe('a gallery', () => {
    const BARN = '![A red barn](/media/barn.webp)';
    const LAKE = '![A lake](/media/lake.webp)';
    const RYE = '![A field of rye](/media/rye.webp)';
    const TWO = `${BARN}\n${LAKE}`;
    const FULL = `${BARN}\n${LAKE}\\\nAt dawn\nA farm in summer`;
    const LIBRARY = { entries: [{ src: '/media/lantern.webp', alt: 'A lantern at dusk', caption: 'The quay' }, { src: '/media/lake.webp', alt: 'A lake', caption: '' }, { src: '/media/rye.webp', alt: 'A field of rye', caption: '' }] };
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');
    const picking = () => page.getByRole('dialog', { name: 'Choose images' });
    const editing = () => page.getByRole('dialog', { name: 'Edit the gallery' });
    const startEditing = async () => {
      await page.getByRole('button', { name: 'Edit the gallery' }).click();
      await editing().waitFor();
    };
    const row = (index) => editing().locator('.konzilo-gallery-row').nth(index);
    const done = async () => {
      await editing().getByRole('button', { name: 'Done' }).click();
      await editing().waitFor({ state: 'detached' });
    };
    const altsAre = async () => (await call('galleries'))[0].images.map(({ alt }) => alt);
    const openMenu = async () => {
      await call('focusEnd');
      if (!(await call('atEmptyBlock'))) await page.keyboard.press('Enter');
      await page.keyboard.type('/gallery', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Gallery' }).waitFor();
      await page.keyboard.press('Enter');
      await picking().waitFor();
    };
    const removeInDialog = async (index) => {
      await startEditing();
      await row(index).getByRole('button', { name: 'Remove the image' }).click();
      await done();
    };

    test('opens as its images, their captions and its own, and changes nothing', async () => {
      assert.equal(await call('open', FULL, { library: LIBRARY }), 'editor', (await call('notes')).join(' '));
      assert.deepEqual(await call('galleries'), [{ images: [{ src: '/media/barn.webp', alt: 'A red barn', caption: '' }, { src: '/media/lake.webp', alt: 'A lake', caption: 'At dawn' }], caption: 'A farm in summer' }]);
      assert.equal(await page.locator('.konzilo-kept').count(), 0);
      await page.locator('.konzilo-gallery-images .konzilo-image').nth(1).locator('.konzilo-image-picture[data-state="shown"] img').waitFor();
      await call('poke');
      assert.deepEqual(await call('changes'), []);
      assert.equal(await call('value'), FULL);
    });

    test('keeps a line it cannot read as a gallery as source, for the check to speak of', async () => {
      for (const body of [`${BARN}\n${LAKE} and more`, `${BARN}\nA line\n${LAKE}`, `${BARN}\n${LAKE}\nOne\nTwo`, `${BARN}\n![A](/media/a.webp "A title")`, `${BARN}\n${LAKE}\nWith [a link](/x/)`]) {
        assert.equal(await call('open', body), 'editor', body);
        assert.deepEqual(await call('galleries'), [], body);
        assert.equal(await page.locator('.konzilo-kept').count(), 1, body);
        assert.equal(await call('value'), body);
      }
    });

    test('takes a change to each image\'s caption and its own, with what a caption may hold', async () => {
      await call('open', TWO);
      await call('focusCaption', 1);
      await page.keyboard.type('At dawn', { delay: KEY_DELAY });
      await call('focusGalleryCaption');
      await page.keyboard.type('A farm in summer', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), FULL);
      assert.deepEqual((await call('check', await call('value'), FORMS)).reasons, []);
      await call('selectText', 'summer');
      await call('runMark', 'emphasis');
      await call('flush');
      assert.equal(await call('value'), `${BARN}\n${LAKE}\\\nAt dawn\nA farm in _summer_`);
    });

    test('moves on with Enter: from a caption to the next, and out of the gallery from its own', async () => {
      await call('open', TWO);
      await call('focusCaption', 0);
      await page.keyboard.type('One', { delay: KEY_DELAY });
      await page.keyboard.press('Enter');
      await page.keyboard.type('Two', { delay: KEY_DELAY });
      await page.keyboard.press('Enter');
      await page.keyboard.type('Own', { delay: KEY_DELAY });
      await page.keyboard.press('Enter');
      await page.keyboard.type('After', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), `${BARN}\\\nOne\n${LAKE}\\\nTwo\nOwn\n\nAfter`);
    });

    test('stays a gallery whatever is typed or pressed in a caption', async () => {
      for (const focus of [() => call('focusCaption', 0), () => call('focusGalleryCaption')]) {
        for (const typed of ['## ', '- ', '> ', '1. ', '``` ', '| a |']) {
          await call('open', TWO);
          await focus();
          await page.keyboard.type(typed, { delay: KEY_DELAY });
          assert.deepEqual((await call('topBlocks')).slice(0, 1), ['konzilo_gallery'], typed);
        }
        for (const key of ['Control+Alt+2', 'Control+Alt+0', 'Control+Alt+c', 'Meta+Alt+2', 'Meta+Alt+0', 'Meta+Alt+c', 'Shift+Enter']) {
          await call('open', TWO);
          await focus();
          await page.keyboard.press(key);
          assert.deepEqual((await call('topBlocks')).slice(0, 1), ['konzilo_gallery'], key);
          assert.equal((await call('galleries'))[0].images.length, 2, key);
        }
      }
      await call('open', `One\n\n${TWO}\n\nTwo`);
      await call('selectAll');
      for (const key of ['Control+Alt+2', 'Meta+Alt+2', 'Control+Alt+c', 'Meta+Alt+c']) await page.keyboard.press(key);
      await call('flush');
      assert.ok((await call('topBlocks')).includes('konzilo_gallery'));
    });

    test('writes what would read as something else so that it reads back the same', async () => {
      for (const caption of ['# not a heading', '- not an item', '> not a quote', '2024. A year', '![not](an-image.webp)', 'www.example.com, https://example.com and a@example.com', '10:30', '2 * 3 _ 4 ` 5', '::x', '<b>x</b>', '[a](b)']) {
        for (const [focus, read] of [[() => call('focusCaption', 1), (one) => one.images[1].caption], [() => call('focusGalleryCaption'), (one) => one.caption]]) {
          await call('open', TWO);
          await focus();
          await page.keyboard.type(caption, { delay: 5 });
          await call('flush');
          const value = await call('value');
          assert.deepEqual((await call('check', value, FORMS)).reasons, [], `${caption}: ${value}`);
          assert.equal(await call('open', value), 'editor', `${caption}: ${value}`);
          assert.equal(read((await call('galleries'))[0]), caption, value);
        }
      }
    });

    test('has a caption of spaces as no caption', async () => {
      await call('open', TWO);
      await call('focusCaption', 0);
      await page.keyboard.type('   ', { delay: KEY_DELAY });
      await call('focusGalleryCaption');
      await page.keyboard.type('   ', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('written'), TWO);
    });

    test('has one pen in the flow and no other control, and its captions in place', async () => {
      await call('open', FULL, { library: LIBRARY });
      await page.locator('.konzilo-gallery-images .konzilo-image-picture[data-state="shown"]').first().waitFor();
      assert.equal(await page.locator('.konzilo-gallery-field button').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Edit the gallery' }).count(), 1);
      assert.equal(await page.locator('.konzilo-gallery-images .konzilo-image-picture').first().getAttribute('draggable'), null, 'nothing to drag there');
    });

    test('has every image\'s alt text in a dialog from its pen, with a caret, in the gallery\'s order', async () => {
      await call('open', FULL, { library: LIBRARY });
      await startEditing();
      const fields = editing().getByRole('textbox', { name: 'Alt text' });
      assert.deepEqual(await fields.evaluateAll((inputs) => inputs.map(({ value }) => value)), ['A red barn', 'A lake']);
      assert.equal(await fields.first().evaluate((input) => document.activeElement === input), true);
      assert.notEqual(await fields.first().evaluate((input) => getComputedStyle(input).caretColor), 'rgba(0, 0, 0, 0)');
      await row(0).locator('img').evaluate((image) => image.decode());
      assert.equal(await fields.last().evaluate((input) => input.closest('dialog').querySelector('figcaption')), null, 'the captions stay in the flow');
      await fields.last().fill('  A lake at dawn ');
      assert.equal((await call('galleries'))[0].images[1].alt, 'A lake', 'nothing changes before it is done');
      await done();
      await call('flush');
      assert.equal(await call('value'), `${BARN}\n![A lake at dawn](/media/lake.webp)\\\nAt dawn\nA farm in summer`);
    });

    test('takes Enter in the dialog as done, and the whole change as one undo', async () => {
      await call('open', `${BARN}\n${LAKE}\n${RYE}`);
      await startEditing();
      await row(0).getByRole('button', { name: 'Move later' }).click();
      await row(1).getByRole('button', { name: 'Remove the image' }).click();
      await row(0).getByRole('textbox').fill('The lake');
      await row(0).getByRole('textbox').press('Enter');
      await editing().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal(await call('value'), `![The lake](/media/lake.webp)\n${RYE}`);
      await call('undoAll');
      assert.equal(await call('value'), `${BARN}\n${LAKE}\n${RYE}`);
    });

    test('changes nothing when the dialog is left, whichever way', async () => {
      await call('open', FULL);
      for (const leave of [() => page.keyboard.press('Escape'), () => editing().getByRole('button', { name: 'Cancel' }).click()]) {
        await startEditing();
        await row(0).getByRole('button', { name: 'Move later' }).click();
        await row(0).getByRole('textbox').fill('Something else');
        await row(1).getByRole('button', { name: 'Remove the image' }).click();
        await leave();
        await editing().waitFor({ state: 'detached' });
        await call('flush');
        assert.equal(await call('value'), FULL);
      }
      await startEditing();
      await done();
      await call('poke');
      assert.deepEqual(await call('changes'), [], 'and done with nothing changed is no change');
    });

    test('takes no blank alt text, and says so on the picture where it has none', async () => {
      const bare = `![](/media/barn.webp)\n${LAKE}`;
      await call('open', bare);
      assert.equal(await page.locator('.konzilo-image-words[data-missing]').textContent(), 'No alt text yet');
      await startEditing();
      await editing().getByRole('button', { name: 'Done' }).click();
      await editing().getByRole('alert').waitFor();
      assert.match(await editing().getByRole('alert').textContent(), /Describe the image/);
      assert.equal(await row(0).getByRole('textbox').getAttribute('aria-invalid'), 'true');
      await row(0).getByRole('textbox').fill('A red barn');
      assert.equal(await row(0).getByRole('textbox').getAttribute('aria-invalid'), null);
      await done();
      assert.equal(await page.locator('.konzilo-image-words[data-missing]').count(), 0);
      await call('flush');
      assert.equal(await call('value'), TWO);
    });

    test('becomes the image left when one of two is removed, keeping a caption, and back with undo', async () => {
      await call('open', FULL);
      await removeInDialog(1);
      await call('flush');
      assert.deepEqual(await call('galleries'), []);
      assert.equal(await call('value'), `${BARN}\\\nA farm in summer`, 'its own caption is the image\'s, which had none');
      await call('undoAll');
      assert.equal(await call('value'), FULL);

      await removeInDialog(0);
      await call('flush');
      assert.equal(await call('value'), `${LAKE}\\\nAt dawn`, 'an image\'s own caption stands');
      await call('undoAll');
      assert.equal(await call('value'), FULL);

      await call('open', `${BARN}\n${LAKE}\n${RYE}`);
      await removeInDialog(1);
      await call('flush');
      assert.equal(await call('value'), `${BARN}\n${RYE}`, 'and of three it stays a gallery');
    });

    test('with every image removed in the dialog, is gone', async () => {
      await call('open', `One\n\n${TWO}\n\nTwo`);
      await startEditing();
      await row(0).getByRole('button', { name: 'Remove the image' }).click();
      await row(0).getByRole('button', { name: 'Remove the image' }).click();
      await done();
      await call('flush');
      assert.equal(await call('value'), 'One\n\nTwo');
    });

    test('changes its order with a button on each row, none past its ends, keeping their captions', async () => {
      await call('open', `${BARN}\\\nOne\n${LAKE}\\\nTwo\n${RYE}\\\nThree`);
      await startEditing();
      const earlier = (index) => row(index).getByRole('button', { name: 'Move earlier' });
      const later = (index) => row(index).getByRole('button', { name: 'Move later' });
      assert.equal(await earlier(0).isVisible(), false);
      assert.equal(await later(0).isVisible(), true);
      assert.equal(await later(2).isVisible(), false);
      await later(0).click();
      await earlier(2).click();
      await done();
      assert.deepEqual(await altsAre(), ['A lake', 'A field of rye', 'A red barn']);
      await call('flush');
      assert.equal(await call('value'), `${LAKE}\\\nTwo\n${RYE}\\\nThree\n${BARN}\\\nOne`);
      assert.deepEqual((await call('check', await call('value'), FORMS)).reasons, []);
    });

    test('keeps the keyboard on the button when it moves a row', async () => {
      await call('open', `${BARN}\n${LAKE}\n${RYE}`);
      await startEditing();
      await row(0).getByRole('button', { name: 'Move later' }).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      assert.deepEqual(await editing().getByRole('textbox').evaluateAll((inputs) => inputs.map(({ value }) => value)), ['A lake', 'A field of rye', 'A red barn']);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Move earlier', 'at the end, on the way back');
      assert.equal(await editing().isVisible(), true, 'and the dialog stays');
      await editing().getByRole('button', { name: 'Cancel' }).click();
    });

    test('changes its order by dragging a row by its handle, to either side of another', async () => {
      await call('open', `${BARN}\n${LAKE}\n${RYE}`);
      await startEditing();
      const order = () => editing().getByRole('textbox').evaluateAll((inputs) => inputs.map(({ value }) => value));
      const drag = async (from, to, side) => {
        const start = await row(from).locator('.konzilo-gallery-handle').boundingBox();
        const end = await row(to).boundingBox();
        const y = side === 'before' ? end.y + 6 : end.y + end.height - 6;
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        await page.mouse.move(start.x + start.width / 2 + 4, start.y + start.height / 2 + 8, { steps: 3 });
        await page.mouse.move(start.x + start.width / 2, y, { steps: 6 });
        assert.equal(await editing().locator('[data-drop]').count(), 1, 'with a mark where it would land');
        await page.mouse.up();
        await editing().locator('[data-drop]').waitFor({ state: 'detached' });
      };
      await drag(0, 2, 'after');
      assert.deepEqual(await order(), ['A lake', 'A field of rye', 'A red barn']);
      await drag(2, 0, 'before');
      assert.deepEqual(await order(), ['A red barn', 'A lake', 'A field of rye']);
      await drag(0, 1, 'after');
      assert.deepEqual(await order(), ['A lake', 'A red barn', 'A field of rye']);
      await done();
      assert.deepEqual(await altsAre(), ['A lake', 'A red barn', 'A field of rye']);
    });

    test('moves whole with the block handle, which stands for the gallery and not an image in it', async () => {
      await call('open', `${TWO}\n\nThe paragraph`);
      await page.locator('.konzilo-gallery-images .konzilo-image').nth(1).locator('.konzilo-image-caption').hover();
      const handle = page.locator('.milkdown-block-handle[data-show="true"] .operation-item');
      await handle.first().waitFor();
      await page.waitForTimeout(300);
      assert.ok((await handle.first().boundingBox()).x < (await page.locator('.konzilo-gallery-images .konzilo-image').first().boundingBox()).x, 'beside the gallery, not over an image in it');
      assert.equal(await page.getByRole('button', { name: 'Edit the gallery' }).evaluate((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
      }), true);
      const { x, y, width, height } = await handle.first().boundingBox();
      await page.mouse.move(x + width / 2, y + height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await page.locator('.milkdown-slash-menu[data-show="true"]').waitFor();
      assert.deepEqual((await call('topBlocks')).slice(0, 3), ['konzilo_gallery', 'paragraph', 'paragraph'], 'the plus puts a block after the gallery');
      await page.keyboard.press('Backspace');
    });

    test('from `/gallery`, takes the images in the order they are picked', async () => {
      await call('open', 'One', { library: LIBRARY });
      await openMenu();
      const items = picking().locator('.konzilo-chooser-item');
      await items.first().waitFor();
      const add = picking().locator('.konzilo-chooser-foot button');
      assert.equal(await add.isDisabled(), true, 'nothing to add yet');
      await picking().getByRole('button', { name: 'A lantern at dusk' }).click();
      assert.equal(await add.textContent(), 'Add 1 image');
      await picking().getByRole('button', { name: 'A field of rye' }).click();
      await picking().getByRole('button', { name: 'A lake' }).click();
      assert.equal(await add.textContent(), 'Add 3 images');
      await picking().getByRole('button', { name: 'A field of rye' }).click();
      assert.equal(await add.textContent(), 'Add 2 images', 'a second click takes one back');
      await picking().getByRole('button', { name: 'A field of rye' }).click();
      assert.equal(await picking().getByRole('button', { name: 'A field of rye' }).getAttribute('aria-pressed'), 'true');
      assert.equal(await picking().getByRole('button', { name: 'A field of rye' }).locator('.konzilo-chooser-order').textContent(), '3');
      await add.click();
      await picking().waitFor({ state: 'detached' });
      assert.deepEqual((await call('galleries'))[0].images, [
        { src: '/media/lantern.webp', alt: 'A lantern at dusk', caption: 'The quay' },
        { src: '/media/lake.webp', alt: 'A lake', caption: '' },
        { src: '/media/rye.webp', alt: 'A field of rye', caption: '' },
      ]);
      await page.keyboard.type('Writing goes on', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), 'One\n\n![A lantern at dusk](/media/lantern.webp)\\\nThe quay\n![A lake](/media/lake.webp)\n![A field of rye](/media/rye.webp)\n\nWriting goes on');
    });

    test('from `/gallery`, with one image picked, is that image, and with none is nothing', async () => {
      await call('open', '', { library: LIBRARY });
      await openMenu();
      await picking().getByRole('button', { name: 'A lake' }).click();
      await picking().locator('.konzilo-chooser-foot button').click();
      await picking().waitFor({ state: 'detached' });
      await call('flush');
      assert.deepEqual(await call('galleries'), []);
      assert.equal(await call('value'), LAKE);

      await call('open', 'One', { library: LIBRARY });
      await openMenu();
      await page.keyboard.press('Escape');
      await picking().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal((await call('value')).trim(), 'One');
    });

    test('from `/gallery`, an upload joins what is picked, and the list stays open', async () => {
      await call('open', '', { library: LIBRARY });
      await openMenu();
      await picking().getByRole('button', { name: 'A lake' }).click();
      await picking().getByRole('button', { name: 'Upload a new image' }).click();
      await picking().locator('input[type=file]').setInputFiles({ name: 'barn.png', mimeType: 'image/png', buffer: PNG });
      await picking().getByRole('textbox', { name: 'Alt text' }).fill('A red barn');
      await picking().getByRole('button', { name: 'Upload and use' }).click();
      await picking().locator('.konzilo-chooser-item').first().waitFor();
      assert.equal(await picking().locator('.konzilo-chooser-foot button').textContent(), 'Add 2 images');
      assert.equal(await picking().getByRole('button', { name: 'A red barn' }).getAttribute('aria-pressed'), 'true');
      await picking().locator('.konzilo-chooser-foot button').click();
      await picking().waitFor({ state: 'detached' });
      assert.deepEqual(await altsAre(), ['A lake', 'A red barn']);
    });

    test('takes more images in the dialog, in the order picked, before its own caption', async () => {
      await call('open', FULL, { library: LIBRARY });
      await startEditing();
      await editing().getByRole('button', { name: 'Add images' }).click();
      await picking().getByRole('button', { name: 'A field of rye' }).click();
      await picking().getByRole('button', { name: 'A lantern at dusk' }).click();
      await picking().locator('.konzilo-chooser-foot button').click();
      await picking().waitFor({ state: 'detached' });
      assert.equal(await editing().locator('.konzilo-gallery-row').count(), 4);
      assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.getAttribute('aria-label')), 'Edit the gallery', 'back in the dialog');
      await done();
      await call('flush');
      assert.equal(await call('value'), `${BARN}\n${LAKE}\\\nAt dawn\n${RYE}\n![A lantern at dusk](/media/lantern.webp)\\\nThe quay\nA farm in summer`);
      assert.deepEqual((await call('check', await call('value'), FORMS)).reasons, []);

      await startEditing();
      await editing().getByRole('button', { name: 'Add images' }).click();
      await page.keyboard.press('Escape');
      await picking().waitFor({ state: 'detached' });
      assert.equal(await editing().isVisible(), true, 'and a change of mind leaves the dialog open');
      assert.equal(await editing().locator('.konzilo-gallery-row').count(), 4);
      await editing().getByRole('button', { name: 'Cancel' }).click();
    });

    test('comes out whole only when asked twice, and back with undo', async () => {
      const body = `One\n\n${FULL}\n\nTwo`;
      await call('open', body);
      await startEditing();
      await row(0).getByRole('textbox').fill('Typed before thinking again');
      await editing().getByRole('button', { name: 'Remove the gallery' }).click();
      assert.match(await editing().textContent(), /Remove this gallery from the text\?/);
      assert.match(await editing().textContent(), /image library stays as it is/);
      const keep = editing().getByRole('button', { name: 'Keep the gallery' });
      assert.equal(await keep.evaluate((element) => document.activeElement === element), true, 'with the safe answer in hand');
      await keep.click();
      assert.equal(await row(0).getByRole('textbox').inputValue(), 'Typed before thinking again', 'back with what was typed');

      await editing().getByRole('button', { name: 'Remove the gallery' }).click();
      await page.keyboard.press('Escape');
      await row(0).waitFor();
      assert.equal(await editing().isVisible(), true, 'Escape takes one step back');

      await editing().getByRole('button', { name: 'Remove the gallery' }).click();
      await editing().getByRole('button', { name: 'Remove', exact: true }).click();
      await editing().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal(await call('value'), 'One\n\nTwo');
      await call('undoAll');
      assert.equal(await call('value'), body);
    });

    test('where a type does not take galleries, stays source and is not on offer', async () => {
      assert.equal(await call('open', `One\n\n${TWO}`, { elements: ['paragraph', 'image'], library: LIBRARY }), 'editor');
      assert.equal(await page.locator('.konzilo-kept').count(), 1);
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li').first().waitFor();
      const offered = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(offered.some((label) => label.includes('Image')), offered.join());
      assert.ok(!offered.some((label) => label.includes('Gallery')), offered.join());
    });

    test('where a type takes galleries but not images, stays source', async () => {
      assert.equal(await call('open', TWO, { elements: ['paragraph', 'gallery'], library: LIBRARY }), 'editor');
      assert.equal(await page.locator('.konzilo-kept').count(), 1);
    });

    test('without a library, holds what it has and offers no more', async () => {
      await call('open', TWO);
      assert.equal((await call('galleries')).length, 1);
      await startEditing();
      assert.equal(await editing().getByRole('button', { name: 'Add images' }).count(), 0);
      await editing().getByRole('button', { name: 'Cancel' }).click();
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li').first().waitFor();
      const offered = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(!offered.some((label) => label.includes('Gallery')), offered.join());
    });

    test('from outside does not come along in a paste', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await call('paste', { html: '<figure data-konzilo-gallery><figure data-konzilo-image data-src="https://elsewhere.example/a.png" data-alt="Forged"><figcaption>Forged</figcaption></figure><figure data-konzilo-image data-src="https://elsewhere.example/b.png" data-alt="Forged"><figcaption></figcaption></figure><figcaption data-konzilo-gallery-caption>Forged</figcaption></figure>' });
      assert.deepEqual(await call('galleries'), []);
      assert.deepEqual(await call('images'), []);
    });
  });

  describe('an embed', () => {
    const VIDEO = 'https://www.youtube.com/watch?v=Kz3pQ8vXw1A';
    const OTHER = 'https://vimeo.com/76979871';
    const editing = () => page.getByRole('dialog', { name: 'Edit the embed' });
    const adding = () => page.getByRole('dialog', { name: 'Embed content' });
    const address = (dialog) => dialog.getByRole('textbox', { name: 'The address' });
    const startEditing = async () => {
      await page.getByRole('button', { name: 'Edit the embed' }).click();
      await editing().waitFor();
    };
    const done = async (dialog) => {
      await dialog.getByRole('button', { name: 'Done' }).click();
      await dialog.waitFor({ state: 'detached' });
    };
    const openMenu = async () => {
      await call('focusEnd');
      if (!(await call('atEmptyBlock'))) await page.keyboard.press('Enter');
      await page.keyboard.type('/embed', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Embed' }).waitFor();
      await page.keyboard.press('Enter');
      await adding().waitFor();
    };

    test('opens as a panel naming its service, and changes nothing', async () => {
      const body = `One\n\n${VIDEO}\n\nTwo`;
      assert.equal(await call('open', body), 'editor', (await call('notes')).join(' '));
      assert.deepEqual(await call('embeds'), [VIDEO]);
      assert.equal(await page.locator('.konzilo-kept').count(), 0);
      const panel = page.locator('.konzilo-embed-field');
      assert.match(await panel.textContent(), /YouTube/);
      assert.match(await panel.textContent(), /watch\?v=Kz3pQ8vXw1A/);
      await call('poke');
      assert.deepEqual(await call('changes'), []);
      assert.equal(await call('value'), body);
    });

    test('in angle brackets, stays as it was written', async () => {
      const body = `<${VIDEO}>`;
      assert.equal(await call('open', body), 'editor');
      assert.deepEqual(await call('embeds'), [VIDEO]);
      await call('poke');
      assert.equal(await call('value'), body);
      await typeAfter('One');
      assert.equal(await call('value'), `${body}\n\nOne`);
    });

    const typeAfter = async (text) => {
      await call('focusEnd');
      if (!(await call('atEmptyBlock'))) await page.keyboard.press('Enter');
      await page.keyboard.type(text, { delay: KEY_DELAY });
      await call('flush');
    };

    test('of no service the site takes, stays source, for the check to speak of', async () => {
      for (const [body, why] of [['https://example.com/a', /cannot embed content from example.com/], ['https://www.youtube.com/playlist', /YouTube/]]) {
        assert.equal(await call('open', body), 'editor', body);
        assert.deepEqual(await call('embeds'), [], body);
        assert.equal(await page.locator('.konzilo-kept').count(), 1, body);
        assert.match((await call('check', body, FORMS)).reasons.join(), why, body);
      }
    });

    test('a link to such an address stays the link it says it is', async () => {
      const body = `[${VIDEO}](${VIDEO})`;
      assert.equal(await call('open', body), 'editor');
      assert.deepEqual(await call('embeds'), []);
      assert.equal(await page.locator('.konzilo-kept').count(), 0);
    });

    test('where a type does not take embeds, stays source and is not on offer', async () => {
      assert.equal(await call('open', `One\n\n${VIDEO}`, { elements: ['paragraph', 'image'] }), 'editor');
      assert.deepEqual(await call('embeds'), []);
      assert.equal(await page.locator('.konzilo-kept').count(), 1);
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/', { delay: KEY_DELAY });
      await page.locator('.milkdown-slash-menu li').first().waitFor();
      const offered = await page.locator('.milkdown-slash-menu li').allTextContents();
      assert.ok(!offered.some((label) => label.includes('Embed')), offered.join());
      await page.keyboard.press('Backspace');
      await call('selectAll');
      await call('paste', { text: VIDEO });
      assert.deepEqual(await call('embeds'), [], 'and an address pasted is no embed there');
    });

    test('in the dialog, shows its address with a caret, and takes another service\'s', async () => {
      await call('open', `One\n\n${VIDEO}\n\nTwo`);
      await startEditing();
      assert.equal(await address(editing()).inputValue(), VIDEO);
      assert.equal(await address(editing()).evaluate((input) => document.activeElement === input), true);
      assert.notEqual(await address(editing()).evaluate((input) => getComputedStyle(input).caretColor), 'rgba(0, 0, 0, 0)');
      await address(editing()).fill(`  ${OTHER} `);
      assert.deepEqual(await call('embeds'), [VIDEO], 'nothing changes before it is done');
      await done(editing());
      await call('flush');
      assert.equal(await call('value'), `One\n\n${OTHER}\n\nTwo`);
      assert.match(await page.locator('.konzilo-embed-field').textContent(), /Vimeo/);
      assert.deepEqual((await call('check', await call('value'), FORMS)).reasons, []);
    });

    test('takes Enter in the dialog as done, and the change as one undo', async () => {
      await call('open', VIDEO);
      await startEditing();
      await address(editing()).fill(OTHER);
      await address(editing()).press('Enter');
      await editing().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal(await call('value'), OTHER);
      await call('undoAll');
      assert.equal(await call('value'), VIDEO);
    });

    test('changes nothing when the dialog is left, whichever way, or done unchanged', async () => {
      const body = `<${VIDEO}>`;
      await call('open', body);
      for (const leave of [() => page.keyboard.press('Escape'), () => editing().getByRole('button', { name: 'Cancel' }).click()]) {
        await startEditing();
        await address(editing()).fill(OTHER);
        await leave();
        await editing().waitFor({ state: 'detached' });
        await call('flush');
        assert.equal(await call('value'), body);
      }
      await startEditing();
      await done(editing());
      await call('poke');
      assert.deepEqual(await call('changes'), []);
      assert.equal(await call('value'), body, 'in the form it had');
    });

    test('takes no address the site cannot embed, in the site\'s words', async () => {
      await call('open', VIDEO);
      await startEditing();
      for (const [written, why] of [['https://example.com/a', /cannot embed content from example.com/], ['https://www.youtube.com/playlist', /YouTube/], ['', /Paste the address/], ['not an address', /cannot embed/]]) {
        await address(editing()).fill(written);
        await editing().getByRole('button', { name: 'Done' }).click();
        await editing().getByRole('alert').waitFor();
        assert.match(await editing().getByRole('alert').textContent(), why, written);
        assert.equal(await address(editing()).getAttribute('aria-invalid'), 'true');
      }
      await address(editing()).fill(OTHER);
      assert.equal(await address(editing()).getAttribute('aria-invalid'), null);
      await editing().getByRole('button', { name: 'Cancel' }).click();
      assert.deepEqual(await call('embeds'), [VIDEO]);
    });

    test('comes out only when asked twice, and back with undo', async () => {
      const body = `One\n\n${VIDEO}\n\nTwo`;
      await call('open', body);
      await startEditing();
      await address(editing()).fill(OTHER);
      await editing().getByRole('button', { name: 'Remove the embed' }).click();
      assert.match(await editing().textContent(), /Remove this embed from the text\?/);
      const keep = editing().getByRole('button', { name: 'Keep the embed' });
      assert.equal(await keep.evaluate((element) => document.activeElement === element), true);
      await keep.click();
      assert.equal(await address(editing()).inputValue(), OTHER, 'back with what was typed');
      await editing().getByRole('button', { name: 'Remove the embed' }).click();
      await page.keyboard.press('Escape');
      await address(editing()).waitFor();
      await editing().getByRole('button', { name: 'Remove the embed' }).click();
      await editing().getByRole('button', { name: 'Remove', exact: true }).click();
      await editing().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal(await call('value'), 'One\n\nTwo');
      await call('undoAll');
      assert.equal(await call('value'), body);
    });

    test('from `/embed`, lands where the block was, with writing to go on after', async () => {
      await call('open', 'One');
      await openMenu();
      assert.match(await adding().textContent(), /YouTube.*Vimeo/s, 'saying what it takes');
      assert.equal(await adding().getByRole('button', { name: 'Remove the embed' }).count(), 0);
      await address(adding()).fill(VIDEO);
      await done(adding());
      await page.keyboard.type('After', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), `One\n\n${VIDEO}\n\nAfter`);
      assert.deepEqual((await call('check', await call('value'), FORMS)).reasons, []);
    });

    test('from `/embed`, writes an address that would not read back whole in angle brackets', async () => {
      const ending = 'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678';
      await call('open', '');
      await openMenu();
      await address(adding()).fill(ending);
      await done(adding());
      await call('flush');
      const value = await call('value');
      assert.equal(await call('open', value), 'editor', value);
      assert.deepEqual(await call('embeds'), [ending], value);
      assert.deepEqual((await call('check', value, FORMS)).reasons, [], value);
    });

    test('from `/embed`, left, puts nothing in', async () => {
      await call('open', 'One');
      await openMenu();
      await page.keyboard.press('Escape');
      await adding().waitFor({ state: 'detached' });
      await call('flush');
      assert.equal((await call('value')).trim(), 'One');
      assert.deepEqual(await call('embeds'), []);
    });

    test('becomes one when its address is pasted on an empty line', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await call('paste', { text: `  ${VIDEO}\n` });
      assert.deepEqual(await call('embeds'), [VIDEO]);
      await page.keyboard.type('After', { delay: KEY_DELAY });
      await call('flush');
      assert.equal(await call('value'), `One\n\n${VIDEO}\n\nAfter`);
    });

    test('does not when pasted in text, or when the site takes no such address', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await call('paste', { text: VIDEO });
      assert.deepEqual(await call('embeds'), [], 'in text');
      await call('open', 'One');
      await call('focusEnd');
      await page.keyboard.press('Enter');
      await call('paste', { text: 'https://example.com/a' });
      assert.deepEqual(await call('embeds'), [], 'of no service');
      await call('open', '- One');
      await call('selectText', 'One');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await call('paste', { text: VIDEO });
      assert.deepEqual(await call('embeds'), [], 'in a list');
    });

    test('from outside does not come along in a paste', async () => {
      await call('open', 'One');
      await call('focusEnd');
      await call('paste', { html: `<div data-konzilo-embed data-address="${VIDEO}" data-value="${VIDEO}"></div>` });
      assert.deepEqual(await call('embeds'), []);
    });

    test('moves whole with the block handle, whose plus comes after it', async () => {
      await call('open', `${VIDEO}\n\nThe paragraph`);
      await page.locator('.konzilo-embed-field').hover();
      const handle = page.locator('.milkdown-block-handle[data-show="true"] .operation-item');
      await handle.first().waitFor();
      await page.waitForTimeout(300);
      const { x, y, width, height } = await handle.first().boundingBox();
      await page.mouse.move(x + width / 2, y + height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await page.locator('.milkdown-slash-menu[data-show="true"]').waitFor();
      assert.deepEqual((await call('topBlocks')).slice(0, 2), ['konzilo_embed', 'paragraph']);
      await page.keyboard.press('Backspace');
    });
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
  });

  describe('a kept block', () => {
    // The contrast of an element's text against what stands behind it, up to the page.
    const contrastOf = (selector) => page.locator(selector).first().evaluate((element) => {
      const parsed = (text) => {
        const srgb = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/.exec(text);
        if (srgb) return { rgb: srgb.slice(1, 4).map((one) => Number(one) * 255), alpha: srgb[4] === undefined ? 1 : Number(srgb[4]) };
        const [r, g, b, alpha = 1] = text.match(/[\d.]+/g).map(Number);
        return { rgb: [r, g, b], alpha };
      };
      const over = (top, under) => top.rgb.map((one, index) => one * top.alpha + under[index] * (1 - top.alpha));
      const layers = [];
      for (let at = element; at; at = at.parentElement) layers.unshift(parsed(getComputedStyle(at).backgroundColor));
      const behind = layers.reduce((under, layer) => over(layer, under), [255, 255, 255]);
      const text = parsed(getComputedStyle(element).color);
      const seen = over({ rgb: text.rgb, alpha: text.alpha * Number(getComputedStyle(element).opacity) }, behind);
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map((one) => {
          const part = one / 255;
          return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [lighter, darker] = [luminance(seen), luminance(behind)].sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    });

    for (const colorScheme of ['light', 'dark']) {
      test(`as an embed's panel, reads clearly, chosen or not, on a machine set to ${colorScheme}`, async () => {
        await page.emulateMedia({ colorScheme });
        try {
          assert.equal(await call('open', 'One\n\nhttps://vimeo.com/123456789'), 'editor');
          const panel = page.locator('.konzilo-embed-field');
          for (const state of ['not chosen', 'chosen']) {
            if (state === 'chosen') {
              await panel.locator('.konzilo-embed-service').click();
              assert.match(await panel.getAttribute('class'), /ProseMirror-selectednode/);
              assert.notEqual(await panel.evaluate((element) => getComputedStyle(element).outlineStyle), 'none', 'it shows it is chosen');
            }
            for (const part of ['.konzilo-embed-service', '.konzilo-embed-address']) {
              const contrast = await contrastOf(part);
              assert.ok(contrast >= 4.5, `${part}, ${state}: contrast ${contrast.toFixed(2)}`);
            }
          }
        } finally {
          await page.emulateMedia({ colorScheme: 'light' });
        }
      });

      test(`reads clearly, chosen or not, on a machine set to ${colorScheme}`, async () => {
        await page.emulateMedia({ colorScheme });
        try {
          assert.equal(await call('open', 'One\n\n::form{name="contact"}'), 'editor');
          const kept = page.locator('.konzilo-kept');
          assert.equal(await kept.count(), 1);
          for (const state of ['not chosen', 'chosen']) {
            if (state === 'chosen') {
              await kept.click();
              assert.match(await kept.getAttribute('class'), /ProseMirror-selectednode/);
              assert.notEqual(await kept.evaluate((element) => getComputedStyle(element).outlineStyle), 'none', 'it shows it is chosen');
            }
            for (const part of ['.konzilo-kept-label', '.konzilo-kept pre']) {
              const contrast = await contrastOf(part);
              assert.ok(contrast >= 4.5, `${part}, ${state}: contrast ${contrast.toFixed(2)}`);
            }
          }
        } finally {
          await page.emulateMedia({ colorScheme: null });
        }
      });
    }
  });

  describe('two fields on one page', () => {
    test('each keeps to its own text', async () => {
      await call('openTwo', 'One', 'Ett');
      await call('focusEndOf', 0);
      await page.keyboard.type(' two', { delay: KEY_DELAY });
      await call('focusEndOf', 1);
      await page.keyboard.type(' två', { delay: KEY_DELAY });
      await call('focusEndOf', 0);
      assert.deepEqual(await call('valuesOfTwo'), ['One two', 'Ett två']);
    });
  });

  describe('when the reader does not load', () => {
    test('the editor is told the early check is off, and can still write', async () => {
      const off = await site.newPage({ block: (url) => url.pathname.endsWith('.wasm') });
      try {
        const callOff = (name, ...args) => off.page.evaluate(([method, values]) => globalThis.fieldPage[method](...values), [name, args]);
        assert.equal(await callOff('open', 'One **two**'), 'editor');
        assert.match((await callOff('notes')).join(), /early check is off/);
        await callOff('focusEnd');
        await off.page.keyboard.type(' three', { delay: KEY_DELAY });
        await callOff('flush');
        assert.equal(await callOff('value'), 'One **two three**');
        assert.equal(await callOff('open', 'One  \ntwo'), 'markdown', 'a value it would rewrite stays as it is, since nothing can prove it safe');
      } finally {
        await off.context.close();
      }
    });
  });
});

// Real Sveltia, on its test repository, on a site in two languages, as Compose has no such site.
describe('the body field in Sveltia, on a site in two languages', () => {
  let site;
  let page;
  let seen;

  const save = () => page.getByRole('button', { name: 'Save', exact: true });
  const editors = () => page.locator('.konzilo-body-visual .ProseMirror');

  before(async () => {
    const { language: _one, ...declared } = JSON.parse(readFileSync(join(core, 'site-template/files/site-description.json'), 'utf8'));
    declared.languages = ['sv_SE', 'en_GB'];
    for (const type of Object.values(declared.types)) {
      if (typeof type.address === 'string') type.address = { sv_SE: type.address, en_GB: type.address.replace(/^\/(?=[a-z]+\/)/, '/en-') };
    }
    const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    ({ page, seen } = await site.newPage({ viewport: { width: 1600, height: 900 } }));
    await page.getByRole('button', { name: 'Work with Test Repository' }).click();
    await page.getByText('Pages', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Create New Entry' }).first().click();
    await page.getByRole('radio', { name: 'English (UK)' }).last().click();
    await editors().nth(1).waitFor();
  }, { timeout: 120_000 });

  after(() => site?.close());

  test('holds a field for each language, each keeping to its own text', async () => {
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('En titel');
    await page.getByRole('textbox', { name: 'Titel' }).last().fill('A title');
    await editors().first().click();
    await page.keyboard.type('Svensk text', { delay: KEY_DELAY });
    await editors().last().click();
    await page.keyboard.type('English text', { delay: KEY_DELAY });
    assert.deepEqual(await editors().allTextContents(), ['Svensk text', 'English text']);
  });

  // A person's keys come further apart than the field's short wait, so a write and the value
  // coming back from Sveltia fall between them.
  test('typing at a person\'s pace loses no key and keeps the editor', async () => {
    const sentence = 'The quick brown fox jumps over the lazy dog';
    await editors().first().click();
    await page.keyboard.press('End');
    await page.evaluate(() => {
      globalThis.typingIn = document.querySelector('.konzilo-body-visual .ProseMirror');
    });
    const was = await editors().first().textContent();
    for (const gap of [46, 52, 58, 64]) {
      for (const key of ` ${sentence}`) {
        await page.keyboard.type(key);
        await page.waitForTimeout(gap);
      }
    }
    await page.waitForTimeout(150);
    assert.equal(await editors().first().textContent(), `${was}${` ${sentence}`.repeat(4)}`);
    assert.equal(await page.evaluate(() => globalThis.typingIn === document.querySelector('.konzilo-body-visual .ProseMirror')), true);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(was, { delay: KEY_DELAY });
  });

  test('crossing the responsive breakpoint changes nothing and keeps the undo', async () => {
    await editors().first().click();
    await page.keyboard.press('End');
    // Past the half second in which Milkdown's undo takes typing as one step.
    await page.waitForTimeout(600);
    await page.keyboard.type(' mer', { delay: KEY_DELAY });
    await page.waitForTimeout(150);
    for (const width of [700, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(800);
    }
    await editors().nth(1).waitFor();
    assert.deepEqual(await editors().allTextContents(), ['Svensk text mer', 'English text']);
    await editors().first().click();
    await page.keyboard.press('ControlOrMeta+z');
    assert.deepEqual(await editors().allTextContents(), ['Svensk text', 'English text']);
  });

  test('a refusal in one language names it, in the rule data\'s words, and a fix saves', async () => {
    await page.getByRole('button', { name: 'Show Markdown' }).last().click();
    const source = page.locator('.konzilo-body-source').last();
    await source.fill('# A title in the body\n\nEnglish text');
    await save().click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByText('The site cannot publish this, so nothing has been saved').waitFor();
    await dialog.getByText('en-GB: Block 1: the site cannot publish a heading at level 1').waitFor();
    assert.equal(await dialog.getByText('Please try again later').count(), 0);
    await dialog.getByRole('button', { name: 'OK' }).click();
    assert.equal(await source.inputValue(), '# A title in the body\n\nEnglish text');
    await source.fill('## A heading\n\nEnglish text');
    await save().click();
    await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
  });

  // A build replaced while an editor has the page open, or a dropped connection.
  test('saves when the check before a save does not load, since the intake is what counts', async () => {
    const off = await site.newPage({ viewport: { width: 1600, height: 900 }, block: (url) => /\/pre-save-[^/]+\.js$/.test(url.pathname) });
    try {
      await off.page.getByRole('button', { name: 'Work with Test Repository' }).click();
      await off.page.getByText('Pages', { exact: true }).first().click();
      await off.page.getByRole('button', { name: 'Create New Entry' }).first().click();
      await off.page.getByRole('radio', { name: 'English (UK)' }).last().click();
      await off.page.locator('.konzilo-body-visual .ProseMirror').nth(1).waitFor();
      await off.page.getByRole('textbox', { name: 'Titel' }).first().fill('En titel');
      await off.page.getByRole('textbox', { name: 'Titel' }).last().fill('A title');
      await off.page.getByRole('button', { name: 'Save', exact: true }).click();
      await off.page.waitForFunction(() => /\/entries\//.test(window.location.hash));
    } finally {
      await off.context.close();
    }
  });

  test('says so when the field does not load, and leaves the body as it was', async () => {
    const off = await site.newPage({ viewport: { width: 1600, height: 900 }, block: (url) => /\/field-[^/]+\.js$/.test(url.pathname) });
    try {
      await off.page.getByRole('button', { name: 'Work with Test Repository' }).click();
      await off.page.getByText('Pages', { exact: true }).first().click();
      await off.page.getByRole('button', { name: 'Create New Entry' }).first().click();
      await off.page.getByText('The editor could not load').first().waitFor();
      assert.equal(await off.page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), false);
    } finally {
      await off.context.close();
    }
  });
});

describe('an entry in Sveltia', () => {
  test('has its title, status and body first, and stays open at a save', async () => {
    const config = cmsConfig(readSiteDescription(join(core, 'site-template/files/site-description.json')), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    const site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    try {
      const { page } = await site.newPage({ viewport: { width: 1600, height: 900 } });
      await page.getByRole('button', { name: 'Work with Test Repository' }).click();
      await page.getByText('Pages', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Create New Entry' }).first().click();
      const editor = page.locator('.konzilo-body-visual .ProseMirror');
      await editor.waitFor();
      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      assert.ok((await title.boundingBox()).y < (await editor.boundingBox()).y, 'the title above the body');
      assert.ok((await editor.boundingBox()).y < (await page.getByRole('textbox', { name: 'Slug', exact: true }).boundingBox()).y, 'the body above the slug');
      assert.ok((await editor.boundingBox()).y < 900, 'and the body in sight as it opens');
      await title.fill('Stays open');
      await editor.click();
      await page.keyboard.type('Some words', { delay: KEY_DELAY });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
      await page.waitForTimeout(500);
      assert.equal(await editor.textContent(), 'Some words', 'with the body still in hand');
      assert.equal(await page.getByRole('button', { name: 'Create New Entry' }).count(), 0, 'and no list in its place');
    } finally {
      await site.close();
    }
  });
});

// Sveltia lifts whatever has focus above what stands beside it, and a block's handle stands beside
// its text, so this takes Sveltia's own styles, in every engine, with the cursor in the text.
describe('a block\'s handle in Sveltia', () => {
  for (const [name, engine] of Object.entries(ENGINES)) {
    test(`takes a click with the cursor in the text, in ${name}`, async () => {
      const config = cmsConfig(readSiteDescription(join(core, 'site-template/files/site-description.json')), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
      const site = await openFieldPage({ engine, config: { ...config, backend: { name: 'test-repo' } } });
      try {
        const { page } = await site.newPage({ viewport: { width: 1600, height: 900 } });
        await page.getByRole('button', { name: 'Work with Test Repository' }).click();
        await page.getByText('Pages', { exact: true }).first().click();
        await page.getByRole('button', { name: 'Create New Entry' }).first().click();
        const editor = page.locator('.konzilo-body-visual .ProseMirror');
        await editor.waitFor();
        await editor.click();
        await page.keyboard.type('One', { delay: KEY_DELAY });
        await page.keyboard.press('Enter');
        await page.keyboard.type('Two', { delay: KEY_DELAY });
        assert.equal(await editor.evaluate((element) => document.activeElement === element), true, 'with the cursor in the text');

        await editor.locator('> p').first().hover();
        const items = page.locator('.milkdown-block-handle[data-show="true"] .operation-item');
        await items.first().waitFor();
        // The handle slides to its block.
        await page.waitForTimeout(300);
        for (const item of await items.all()) {
          assert.equal(await item.evaluate((element) => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
          }), true, 'nothing stands over it');
        }

        const { x, y, width, height } = await items.first().boundingBox();
        await page.mouse.move(x + width / 2, y + height / 2, { steps: 4 });
        await page.mouse.down();
        await page.mouse.up();
        await page.locator('.milkdown-slash-menu[data-show="true"]').waitFor({ timeout: 2000 });
        assert.equal(await editor.locator('> p').count(), 3, 'with a new block to fill');
      } finally {
        await site.close();
      }
    });
  }
});

// A drag is the browser's own doing, and each has its own idea of it.
describe('an image in a gallery', () => {
  for (const [name, engine] of Object.entries(ENGINES)) {
    test(`moves by dragging its row in the dialog, and Escape takes one dialog at a time, in ${name}`, async () => {
      const site = await openFieldPage({ engine });
      try {
        const { page, seen } = await site.newPage();
        const call = (method, ...args) => page.evaluate(([one, values]) => globalThis.fieldPage[one](...values), [method, args]);
        await call('open', '![A](/media/a.webp)\\\nOne\n![B](/media/b.webp)\n![C](/media/c.webp)\nOwn', { library: { entries: [] } });
        await page.getByRole('button', { name: 'Edit the gallery' }).click();
        const editing = page.getByRole('dialog', { name: 'Edit the gallery' });
        const rows = editing.locator('.konzilo-gallery-row');

        // Escape in the chooser opened from the dialog closes that alone.
        await editing.getByRole('button', { name: 'Add images' }).click();
        const picking = page.getByRole('dialog', { name: 'Choose images' });
        await picking.waitFor();
        await page.keyboard.press('Escape');
        await picking.waitFor({ state: 'detached' });
        await page.waitForTimeout(100);
        assert.equal(await editing.isVisible(), true);

        const from = await rows.nth(0).locator('.konzilo-gallery-handle').boundingBox();
        const to = await rows.nth(2).boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 + 8, { steps: 3 });
        await page.mouse.move(from.x + from.width / 2, to.y + to.height - 6, { steps: 6 });
        await editing.locator('[data-drop="after"]').waitFor();
        await page.mouse.up();
        await editing.locator('[data-drop]').waitFor({ state: 'detached' });
        await editing.getByRole('button', { name: 'Done' }).click();
        await editing.waitFor({ state: 'detached' });
        await call('flush');
        assert.equal(await call('value'), '![B](/media/b.webp)\n![C](/media/c.webp)\n![A](/media/a.webp)\\\nOne\nOwn');
        // An alt text's field takes the mouse too, in the row a drag starts from.
        await page.getByRole('button', { name: 'Edit the gallery' }).click();
        const field = rows.nth(0).getByRole('textbox');
        await field.click();
        await page.keyboard.press('End');
        await page.keyboard.type('!', { delay: 20 });
        assert.equal(await field.inputValue(), 'B!');
        await editing.getByRole('button', { name: 'Cancel' }).click();
        await page.waitForTimeout(100);
        assert.deepEqual(seen.errors, []);
      } finally {
        await site.close();
      }
    });
  }
});
