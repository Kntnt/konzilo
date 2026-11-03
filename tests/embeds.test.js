// Embeds as the site renders them: a content file's
// paragraph of nothing but an address from a service the site embeds from
// becomes a panel holding a sentence that the site's script has not run,
// which the script takes away, a link to the address and, in a <template>
// no browser loads, the service's player. The players are written by hand
// from each service's own embed code, as read on 2026-10-28.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readContentFile } from '@kntnt/konzilo/astro';
import { parse } from './lib/html.js';

const file = (body) => `---\ntitle: "Hello world"\ndate: 2026-10-01T08:00:00Z\n---\n\n${body}\n`;
// The rendered body's elements, as { tag, attributes, children }.
const rendered = (body) => parse(readContentFile(file(body)).html).filter((node) => typeof node === 'object');

const video = 'aspect-ratio: 16 / 9';
const players = [
  ['https://www.youtube.com/watch?v=Kz3pQ8vXw1A', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A', video],
  ['https://m.youtube.com/watch?v=Kz3pQ8vXw1A&t=90s', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A?start=90', video],
  ['https://youtu.be/Kz3pQ8vXw1A?si=Hq2LmX0aB7cDe9Fg', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A', video],
  ['https://youtu.be/Kz3pQ8vXw1A?si=Hq2LmX0aB7cDe9Fg&t=5', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A?start=5', video],
  ['https://www.youtube.com/shorts/Rt5uVw2Xy3Z', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/Rt5uVw2Xy3Z', video],
  ['https://www.youtube.com/live/Rt5uVw2Xy3Z?si=Hq2LmX0aB7cDe9Fg', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/Rt5uVw2Xy3Z', video],
  ['https://www.youtube.com/playlist?list=PLa1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6', 'youtube', 'YouTube', 'https://www.youtube-nocookie.com/embed/videoseries?list=PLa1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6', video],
  ['https://vimeo.com/76979871', 'vimeo', 'Vimeo', 'https://player.vimeo.com/video/76979871?dnt=1', video],
  ['https://vimeo.com/channels/staffpicks/76979871', 'vimeo', 'Vimeo', 'https://player.vimeo.com/video/76979871?dnt=1', video],
  ['https://vimeo.com/76979871/8272103f6e?share=copy', 'vimeo', 'Vimeo', 'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1', video],
  ['https://player.vimeo.com/video/76979871?h=8272103f6e', 'vimeo', 'Vimeo', 'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1', video],
  ['https://qcnl.tv/e/18yHAXAepWyxPJd79U9uirLogfV6NA3FCjYpkz002M0?ratio=0.5625', 'screen9', 'Screen9', 'https://qcnl.tv/e/18yHAXAepWyxPJd79U9uirLogfV6NA3FCjYpkz002M0?ratio=0.5625', 'aspect-ratio: 1 / 0.5625'],
  ['https://api.screen9.com/embed/18yHAXAepWyxPJd79U9uirLogfV6NA3FCjYpkz002M0', 'screen9', 'Screen9', 'https://api.screen9.com/embed/18yHAXAepWyxPJd79U9uirLogfV6NA3FCjYpkz002M0', video],
  ['https://www.loom.com/share/a-short-tour-0281766fa2d04bb788eaf19e65135184', 'loom', 'Loom', 'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184', video],
  ['https://open.spotify.com/intl-sv/track/4cOdK2wGLETKBW3PvgPWqT?si=a1b2c3d4e5f64a7b', 'spotify', 'Spotify', 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT', 'height: 152px'],
  ['https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ', 'spotify', 'Spotify', 'https://open.spotify.com/embed/episode/5Xt5DXGzch68nYYamXrNxZ', 'height: 152px'],
  ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'spotify', 'Spotify', 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', 'height: 352px'],
  ['https://shows.acast.com/a-show/episodes/the-first-episode', 'acast', 'Acast', 'https://embed.acast.com/a-show/the-first-episode', 'height: 180px'],
  ['https://play.acast.com/s/a-show/the-first-episode', 'acast', 'Acast', 'https://embed.acast.com/a-show/the-first-episode', 'height: 180px'],
  ['https://podcasts.apple.com/se/podcast/a-show/id1200361736', 'apple-podcasts', 'Apple Podcasts', 'https://embed.podcasts.apple.com/se/podcast/id1200361736', 'height: 450px'],
  ['https://podcasts.apple.com/se/podcast/a-show/id1200361736?i=1000798328850', 'apple-podcasts', 'Apple Podcasts', 'https://embed.podcasts.apple.com/se/podcast/id1200361736?i=1000798328850', 'height: 175px'],
  ['https://speakerdeck.com/player/e1bf85b4ae0c4fb0bf0b5522bd7450be', 'speaker-deck', 'Speaker Deck', 'https://speakerdeck.com/player/e1bf85b4ae0c4fb0bf0b5522bd7450be', video],
  ['https://datawrapper.dwcdn.net/Ab3dE/2/', 'datawrapper', 'Datawrapper', 'https://datawrapper.dwcdn.net/Ab3dE/2/', 'height: 400px'],
  ['https://www.datawrapper.de/_/Ab3dE/', 'datawrapper', 'Datawrapper', 'https://datawrapper.dwcdn.net/Ab3dE/', 'height: 400px'],
  ['https://codepen.io/a-coder/pen/gfdDu', 'codepen', 'CodePen', 'https://codepen.io/a-coder/embed/gfdDu', 'height: 300px'],
  ['https://www.linkedin.com/posts/a-person_a-title-activity-7373642190125756416-AbCd?utm_source=share&utm_medium=member_desktop', 'linkedin', 'LinkedIn', 'https://www.linkedin.com/embed/feed/update/urn:li:activity:7373642190125756416', 'height: 600px'],
  ['https://www.linkedin.com/embed/feed/update/urn:li:share:7373642189102518272', 'linkedin', 'LinkedIn', 'https://www.linkedin.com/embed/feed/update/urn:li:share:7373642189102518272', 'height: 600px'],
];

describe('an address of a service the site embeds from', () => {
  for (const [address, service, name, player, size] of players) {
    test(`${address} shows as a panel that holds ${name}'s player, unloaded`, () => {
      const [panel, ...rest] = rendered(address);
      assert.equal(rest.length, 0);
      assert.equal(panel.tag, 'figure');
      assert.deepEqual(panel.attributes, { class: 'konzilo-embed', 'data-embed': service });

      const [notice, link, template, ...more] = panel.children;
      assert.equal(more.length, 0);
      assert.deepEqual(notice, { tag: 'p', attributes: { class: 'konzilo-embed-no-script' }, children: ['The site\'s script has not run, so this content can neither ask for your consent nor load.'] });
      assert.deepEqual(link, { tag: 'a', attributes: { href: address }, children: [address] });
      assert.equal(template.tag, 'template');
      const [frame] = template.children;
      assert.equal(frame.tag, 'iframe');
      assert.equal(frame.attributes.src, player);
      assert.equal(frame.attributes.title, name);
      assert.ok(frame.attributes.style.includes(size), frame.attributes.style);
    });
  }
});

test('nothing outside a panel\'s template loads anything: the panel holds a sentence, a link and the template alone', () => {
  const body = players.map(([address]) => address).join('\n\nA paragraph between.\n\n');
  const outside = (nodes) => nodes.flatMap((node) => (typeof node !== 'object' || node.tag === 'template' ? [] : [node, ...outside(node.children)]));
  const elements = outside(rendered(body));
  assert.ok(elements.filter((node) => node.tag === 'figure').length === players.length);
  for (const node of elements) {
    assert.ok(['figure', 'a', 'p'].includes(node.tag), node.tag);
    assert.deepEqual(Object.keys(node.attributes).filter((key) => !['class', 'data-embed', 'href'].includes(key)), []);
  }
});

test('an address the site does not embed, or an address with text beside it, stays a link', () => {
  for (const body of ['https://twitter.com/a_person/status/1580000000000000000', 'Watch https://www.youtube.com/watch?v=Kz3pQ8vXw1A', '[The talk](https://www.youtube.com/watch?v=Kz3pQ8vXw1A)']) {
    const [paragraph] = rendered(body);
    assert.equal(paragraph.tag, 'p', body);
  }
});
