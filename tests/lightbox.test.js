// The lightbox's writing: what a body's figures come to be on a page, and what is left alone.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pageMarkdown } from '../src/astro/html-to-markdown.js';
import { withLightboxes } from '../src/astro/lightbox.js';

const counter = () => {
  let at = 0;
  return () => {
    at += 1;
    return at;
  };
};
const written = (html, locale = 'en_GB') => withLightboxes(html, { next: counter(), locale });

const IMAGE = '<img src="/_astro/barn.webp" srcset="/_astro/barn-640.webp 640w, /_astro/barn.webp 2520w" width="2520" height="1680" alt="A red &quot;barn&quot; &amp; more">';
const FIGURE = `<figure>${IMAGE}<figcaption>The barn <em>in 1920</em></figcaption></figure>`;
const GALLERY = `<figure class="konzilo-gallery"><figure>${IMAGE}</figure><figure><img src="/_astro/lake.webp" alt="A lake"><figcaption>At dawn</figcaption></figure><figcaption>A farm</figcaption></figure>`;

describe('the lightbox, as a body\'s figures are written', () => {
  test('leaves a body without images byte for byte', () => {
    const html = '<p>One &amp; <em>two</em></p>\n<ul><li>Three</li></ul>';
    assert.equal(written(html), html);
  });

  test('leaves all around what it adds byte for byte', () => {
    const before = '<p  class=x>One &amp; <EM>two</EM></p>\n';
    const after = '\n<p style="text-align:right">Three&nbsp;four</p>';
    const out = written(`${before}${FIGURE}${after}`);
    assert.ok(out.startsWith(`${before}<figure><button`), out);
    assert.ok(out.endsWith(`</dialog>${after}`), out);
  });

  test('puts a button around an image, keeping the image as it was, with a dialog after its figure', () => {
    const out = written(FIGURE);
    assert.ok(out.includes(`data-konzilo-at="0" aria-label="Show larger: A red &quot;barn&quot; &amp; more">${IMAGE}</button><figcaption>The barn <em>in 1920</em></figcaption></figure><dialog `), out);
    assert.match(out, /<button class="konzilo-lightbox-open" type="button" commandfor="konzilo-modal-1" command="show-modal" /);
    assert.match(out, /<dialog class="konzilo-modal konzilo-lightbox" id="konzilo-modal-1" aria-label="Image">/);
  });

  test('has no arrows and no place for a single image', () => {
    const out = written(FIGURE);
    assert.doesNotMatch(out, /data-konzilo-step/);
    assert.doesNotMatch(out, /konzilo-lightbox-place/);
  });

  test('shows each image at the room it gets, asked for when it is about to show, with its caption', () => {
    const dialog = written(FIGURE).split('<dialog')[1];
    assert.match(dialog, /<li><figure><img src="\/_astro\/barn.webp" srcset="[^"]+" width="2520" height="1680" alt="A red &quot;barn&quot; &amp; more" sizes="100vw" loading="lazy" decoding="async"><figcaption>The barn <em>in 1920<\/em><\/figcaption><\/figure><\/li>/);
    assert.match(dialog, /^[^>]*><ul class="konzilo-lightbox-strip" tabindex="0">/, 'first, for the focus');
    assert.match(dialog, /<button class="konzilo-modal-close" type="button" commandfor="konzilo-modal-1" command="close" aria-label="Close">/);
  });

  test('makes a gallery one dialog, with arrows and each image\'s place', () => {
    const out = written(GALLERY);
    assert.equal(out.match(/<dialog /g).length, 1);
    assert.equal(out.match(/commandfor="konzilo-modal-1" command="show-modal"/g).length, 2);
    assert.match(out, /data-konzilo-at="0"/);
    assert.match(out, /data-konzilo-at="1"/);
    assert.match(out, /aria-label="Images"/);
    assert.match(out, /<button class="konzilo-lightbox-step konzilo-lightbox-previous" type="button" data-konzilo-step="-1" aria-label="Previous image">/);
    assert.match(out, /<button class="konzilo-lightbox-step konzilo-lightbox-next" type="button" data-konzilo-step="1" aria-label="Next image">/);
    assert.match(out, /<p class="konzilo-lightbox-place">1 of 2<\/p>/);
    assert.match(out, /<figcaption>At dawn<\/figcaption><p class="konzilo-lightbox-place">2 of 2<\/p>/);
    assert.ok(out.indexOf('</figure><dialog') > 0, 'after the gallery as a whole');
    assert.ok(out.endsWith('</dialog>'), out);
  });

  test('keeps the gallery\'s own caption on the page alone', () => {
    const dialog = written(GALLERY).split('<dialog')[1];
    assert.doesNotMatch(dialog, /A farm/);
  });

  test('gives each dialog a number of its own, from what it is handed', () => {
    const next = counter();
    const one = withLightboxes(`${FIGURE}${FIGURE}`, { next, locale: 'en_GB' });
    const two = withLightboxes(GALLERY, { next, locale: 'en_GB' });
    assert.match(one, /id="konzilo-modal-1"/);
    assert.match(one, /id="konzilo-modal-2"/);
    assert.match(two, /id="konzilo-modal-3"/);
  });

  test('speaks the page\'s language', () => {
    const out = written(GALLERY, 'sv_SE');
    assert.match(out, /aria-label="Visa större: A lake"/);
    assert.match(out, /aria-label="Bilder"/);
    assert.match(out, /aria-label="Stäng"/);
    assert.match(out, /aria-label="Föregående bild"/);
    assert.match(out, /aria-label="Nästa bild"/);
    assert.match(out, />2 av 2</);
    assert.match(written(FIGURE, 'sv_SE'), /aria-label="Bild"/);
    assert.match(written(FIGURE, 'de_DE'), /aria-label="Image"/);
  });

  test('leaves an embed\'s panel alone, and an image that stands in no figure', () => {
    const embed = '<figure class="konzilo-embed" data-embed="youtube"><p>A sentence</p><template><iframe title="YouTube"></iframe></template></figure>';
    assert.equal(written(embed), embed);
    const loose = '<p><img src="/a.webp" alt="A"></p>';
    assert.equal(written(loose), loose);
  });

  test('leaves a page\'s Markdown as it would be without it', () => {
    const markdown = (body) => pageMarkdown({ html: `<html><body><main>${body}</main></body></html>`, url: 'https://example.com/a/', title: 'A page', front: 'title: A page\n' });
    for (const body of [FIGURE, GALLERY]) assert.deepEqual(markdown(written(body)), markdown(body));
    assert.match(markdown(written(FIGURE)).markdown, /!\[.*barn.*\]\(https:\/\/example.com\/_astro\/barn.webp\)/);
  });

  test('finds a figure inside what holds it', () => {
    const out = written(`<section><div>${FIGURE}</div></section>`);
    assert.ok(out.endsWith('</dialog></div></section>'), out);
  });
});
