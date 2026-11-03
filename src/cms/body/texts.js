// What the field says, in the editor's language. Sveltia follows the browser's, so the
// field does too; a refusal stays in the rule data's words.

import { inLanguage } from '../../texts.js';

const TEXTS = {
  loading: { en: 'Loading the editor…', sv: 'Läser in redigeraren…' },
  placeholder: { en: 'Write here, or type / for more', sv: 'Skriv här, eller skriv / för mer' },
  showMarkdown: { en: 'Show Markdown', sv: 'Visa Markdown' },
  showEditor: { en: 'Show the editor', sv: 'Visa redigeraren' },
  markdownLabel: { en: 'The body as Markdown', sv: 'Brödtexten som Markdown' },
  wayOutBlock: {
    en: 'This opens as Markdown, since the editor would change {element} (block {path}). Nothing has been changed.',
    sv: 'Det här öppnas som Markdown, eftersom redigeraren skulle ändra {element} (block {path}). Inget har ändrats.',
  },
  wayOutLost: {
    en: 'This opens as Markdown, since the editor would change the text. Nothing has been changed.',
    sv: 'Det här öppnas som Markdown, eftersom redigeraren skulle ändra texten. Inget har ändrats.',
  },
  wayOutRead: {
    en: 'This opens as Markdown, since the editor cannot read all of it. Nothing has been changed.',
    sv: 'Det här öppnas som Markdown, eftersom redigeraren inte kan läsa allt. Inget har ändrats.',
  },
  wayOutOff: {
    en: 'This opens as Markdown, since the editor would rewrite it and the early check that could prove the meaning stays is off. Nothing has been changed.',
    sv: 'Det här öppnas som Markdown, eftersom redigeraren skulle skriva om det och den tidiga kontrollen som kan visa att innebörden består är avstängd. Inget har ändrats.',
  },
  checkOff: {
    en: 'The early check is off, since it could not load. You can write and save as usual; anything the site cannot publish is reported when it is published.',
    sv: 'Den tidiga kontrollen är avstängd, eftersom den inte gick att läsa in. Du kan skriva och spara som vanligt; det som webbplatsen inte kan publicera rapporteras vid publiceringen.',
  },
  refused: {
    en: 'The site cannot publish this, so nothing has been saved. Your text is still here. What to change:',
    sv: 'Webbplatsen kan inte publicera det här, så inget har sparats. Din text finns kvar. Det här behöver ändras:',
  },
  block: { en: 'Block {path}', sv: 'Block {path}' },
  keptImage: { en: 'An image, kept as Markdown', sv: 'En bild, behålls som Markdown' },
  keptEmbed: { en: 'An embed, kept as Markdown', sv: 'En inbäddning, behålls som Markdown' },
  keptDirective: { en: 'A component, kept as Markdown', sv: 'En komponent, behålls som Markdown' },
  keptHtml: { en: 'A structured table or raw HTML, kept as Markdown', sv: 'En strukturerad tabell eller rå HTML, behålls som Markdown' },
  keptOther: { en: 'Kept as Markdown, since it is not on offer here', sv: 'Behålls som Markdown, eftersom det inte erbjuds här' },
  textGroup: { en: 'Text', sv: 'Text' },
  listGroup: { en: 'List', sv: 'Lista' },
  moreGroup: { en: 'More', sv: 'Mer' },
  text: { en: 'Text', sv: 'Text' },
  heading2: { en: 'Heading 2', sv: 'Rubrik 2' },
  heading3: { en: 'Heading 3', sv: 'Rubrik 3' },
  heading4: { en: 'Heading 4', sv: 'Rubrik 4' },
  heading5: { en: 'Heading 5', sv: 'Rubrik 5' },
  heading6: { en: 'Heading 6', sv: 'Rubrik 6' },
  quote: { en: 'Quote', sv: 'Citat' },
  citation: { en: 'Citation', sv: 'Källa' },
  bulletList: { en: 'Bulleted list', sv: 'Punktlista' },
  orderedList: { en: 'Numbered list', sv: 'Numrerad lista' },
  code: { en: 'Code', sv: 'Kod' },
  table: { en: 'Table', sv: 'Tabell' },
  bold: { en: 'Bold', sv: 'Fet' },
  italic: { en: 'Italic', sv: 'Kursiv' },
  strikethrough: { en: 'Strikethrough', sv: 'Genomstruken' },
  inlineCode: { en: 'Inline code', sv: 'Kod i texten' },
  link: { en: 'Link', sv: 'Länk' },
  superscript: { en: 'Superscript', sv: 'Upphöjd' },
  subscript: { en: 'Subscript', sv: 'Nedsänkt' },
  footnote: { en: 'Footnote', sv: 'Fotnot' },
  linkPlaceholder: { en: 'Paste a link…', sv: 'Klistra in en länk…' },
  anchorAdd: { en: 'Add an anchor', sv: 'Lägg till ett ankare' },
  anchorHint: { en: 'a to z, digits, hyphens and underscores', sv: 'a till z, siffror, bindestreck och understreck' },
};

const ELEMENTS = {
  paragraph: { en: 'a paragraph', sv: 'ett stycke' },
  heading: { en: 'a heading', sv: 'en rubrik' },
  list: { en: 'a list', sv: 'en lista' },
  quote: { en: 'a quote', sv: 'ett citat' },
  code: { en: 'a code block', sv: 'ett kodblock' },
  table: { en: 'a table', sv: 'en tabell' },
  footnotes: { en: 'footnotes', sv: 'fotnoter' },
  embed: { en: 'an embed', sv: 'en inbäddning' },
  image: { en: 'an image', sv: 'en bild' },
  gallery: { en: 'a gallery', sv: 'ett galleri' },
  'post-list': { en: 'a post list', sv: 'en inläggslista' },
  form: { en: 'a form', sv: 'ett formulär' },
};

const language = () => (globalThis.navigator?.language ?? 'en').replace('-', '_');

export function say(key, values = {}) {
  return inLanguage(TEXTS[key], language()).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

export const elementName = (element) => inLanguage(ELEMENTS[element] ?? ELEMENTS.paragraph, language());
