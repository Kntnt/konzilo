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
import { openFieldPage } from './lib/field-page.js';

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
const examples = markedExamples(contentFormat()).checked
  .filter((example) => ['markdown', 'md'].includes(example.language) && !example.attributes['site-description'])
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
      const body = 'First\n\n![An image](/media/a.webp)\n\nhttps://vimeo.com/76979871\n\n::form{name="contact"}\n\n<table>\n<caption>A caption</caption>\n<thead>\n<tr><th>A</th></tr>\n</thead>\n</table>\n\n:::unknown\nInside\n\nmore\n:::\n\nLast';
      assert.equal(await call('open', body), 'editor');
      assert.equal(await page.locator('.konzilo-kept').count(), 5);
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

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
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
    await page.getByRole('button', { name: 'Create New Entry' }).first().waitFor();
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
      await off.page.getByRole('button', { name: 'Create New Entry' }).first().waitFor();
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
