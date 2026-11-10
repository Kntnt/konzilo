// An article's parts, and what each part left empty falls back to: one set of rules for the
// editor's placeholders and for the site, so that a placeholder never promises what the site
// does not do. The parts are the eyebrow, the main headline and the subheadline, the
// standfirst, the teaser with its image, headline and text, and the name in breadcrumbs, each
// a field of the core's (site-description.js). It imports nothing, so that the editor and the
// build both run it.

// Arial's advance widths in thousandths of an em, regular and bold, for the characters a
// Swedish or English text uses, read from the font files. Search engines measure a title in
// Arial 20 px bold and a description in Arial 14 px regular.
const CHARACTERS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ–—‘’‚“”„…•€™";
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,537,333,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500,667,556,667,556,667,556,722,500,722,500,722,500,722,500,722,615,722,556,667,556,667,556,667,556,667,556,667,556,778,556,778,556,778,556,778,556,722,556,722,556,278,278,278,278,278,278,278,222,278,278,735,444,500,222,667,500,500,556,222,556,222,556,292,556,334,556,222,722,556,722,556,722,556,604,723,556,778,556,778,556,778,556,1000,944,722,333,722,333,722,333,667,500,667,500,667,500,667,500,611,278,611,375,611,278,722,556,722,556,722,556,722,556,722,556,722,556,944,722,667,500,667,611,500,611,500,611,500,222,556,1000,222,222,222,333,333,333,1000,350,556,1000];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,556,333,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556,722,556,722,556,722,556,722,556,722,556,722,556,722,556,722,719,722,611,667,556,667,556,667,556,667,556,667,556,778,611,778,611,778,611,778,611,722,611,722,611,278,278,278,278,278,278,278,278,278,278,785,556,556,278,722,556,556,611,278,611,278,611,385,611,479,611,278,722,611,722,611,722,611,708,723,611,778,611,778,611,778,611,1000,944,722,389,722,389,722,389,667,556,667,556,667,556,667,556,611,333,611,479,611,333,722,611,722,611,722,611,722,611,722,611,722,611,944,778,667,556,667,611,500,611,500,611,500,278,556,1000,278,278,278,500,500,500,1000,350,556,1000];
const WIDTHS = {
  regular: new Map([...CHARACTERS].map((character, index) => [character, REGULAR[index]])),
  bold: new Map([...CHARACTERS].map((character, index) => [character, BOLD[index]])),
};
// A character the table lacks counts as an `n`, about an average letter.
const fallbackWidth = (weight) => WIDTHS[weight].get('n');

// What a search result shows, in pixels: a title in Arial 20 px bold, a description in Arial 14 px.
export const SEARCH_TITLE = Object.freeze({ width: 580, size: 20, weight: 'bold' });
export const SEARCH_DESCRIPTION = Object.freeze({ width: 920, size: 14, weight: 'regular' });
// What a shared link shows, in characters.
export const SOCIAL_TITLE_LENGTH = 55;
export const SOCIAL_DESCRIPTION_LENGTH = 100;
// The separator between a title and the site's name in a title tag.
export const TITLE_SEPARATOR = ' | ';
const ELLIPSIS = '…';

// Text without its Markdown: a link as its words, emphasis as its letters.
export function plainText(text = '') {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, '$2')
    .replace(/\\([\\`*_{}\[\]()#+\-.!:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// How wide a text is in pixels, in Arial at `size` px and `weight`.
export function textWidth(text, { size, weight }) {
  let thousandths = 0;
  for (const character of text) thousandths += WIDTHS[weight].get(character) ?? fallbackWidth(weight);
  return (thousandths * size) / 1000;
}

// A text cut at a word so that it and an ellipsis stay within `fits(text)`; the text itself when
// it fits whole. A first word too long alone is cut at a character.
function cut(text, fits) {
  const whole = plainText(text);
  if (fits(whole)) return whole;
  const words = whole.split(' ');
  let kept = '';
  for (const word of words) {
    const next = kept === '' ? word : `${kept} ${word}`;
    if (!fits(`${next}${ELLIPSIS}`)) break;
    kept = next;
  }
  if (kept === '') {
    for (const character of whole) {
      if (!fits(`${kept}${character}${ELLIPSIS}`)) break;
      kept += character;
    }
  }
  return `${kept.replace(/[\s,.;:–—-]+$/, '')}${ELLIPSIS}`;
}

// A text within `width` pixels in a font, or within `length` characters.
export const fitWidth = (text, width, font) => cut(text, (one) => textWidth(one, font) <= width);
export const fitLength = (text, length) => cut(text, (one) => [...one].length <= length);

// A slug as WordPress makes one: lowercase, letters without their accents, å, ä and ö as a, a and
// o, and anything but letters and digits a hyphen.
const SPELLED = { æ: 'ae', ø: 'o', œ: 'oe', ß: 'ss', þ: 'th', ð: 'd', đ: 'd', ł: 'l', ı: 'i' };
export function slugFrom(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[æøœßþðđłı]/g, (letter) => SPELLED[letter])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const given = (text) => (typeof text === 'string' && text.trim() !== '' ? text.trim() : '');

// The name in breadcrumbs: the post's own, else its working name, the title.
export const breadcrumbOf = (data) => given(data.breadcrumb) || given(data.title);

// The teaser's headline: its own, else the eyebrow, a colon and the main headline.
export function teaserHeadlineOf(data) {
  const own = given(data.teaser?.headline);
  if (own) return own;
  const headline = given(data.headline) || given(data.title);
  const eyebrow = given(data.eyebrow);
  return eyebrow && headline ? `${eyebrow}: ${headline}` : headline;
}

// The teaser's text: its own, else the standfirst.
export const teaserTextOf = (data) => given(data.teaser?.text) || given(data.standfirst);

// The teaser's image, { src, alt }: its own, else the main image.
export const teaserImageOf = (data) => (data.teaser?.image?.src ? data.teaser.image : data.image ?? null);

// The title tag: the teaser's headline, cut so that it, the separator and the site's name stay
// within what a search result shows.
export function searchTitleOf(data, siteName = '') {
  const tail = given(siteName) ? `${TITLE_SEPARATOR}${given(siteName)}` : '';
  const room = SEARCH_TITLE.width - textWidth(tail, SEARCH_TITLE);
  const headline = teaserHeadlineOf(data);
  return headline ? `${fitWidth(headline, room, SEARCH_TITLE)}${tail}` : given(siteName);
}

// The meta description: the teaser's text, cut to what a search result shows.
export const searchDescriptionOf = (data) => (teaserTextOf(data) ? fitWidth(teaserTextOf(data), SEARCH_DESCRIPTION.width, SEARCH_DESCRIPTION) : '');

// What a shared link shows: the teaser's headline and text, each cut to its length.
export const socialTitleOf = (data) => (teaserHeadlineOf(data) ? fitLength(teaserHeadlineOf(data), SOCIAL_TITLE_LENGTH) : '');
export const socialDescriptionOf = (data) => (teaserTextOf(data) ? fitLength(teaserTextOf(data), SOCIAL_DESCRIPTION_LENGTH) : '');

// The sharing image's size, and the part of it that every service shows.
export const SHARING_SIZE = Object.freeze({ width: 1200, height: 630 });
export const SHARING_SAFE = Object.freeze({ width: 1080, height: 566 });
