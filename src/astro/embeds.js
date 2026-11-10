// Embeds: a paragraph that holds nothing but the
// address of content from a service the site embeds from shows that
// content, as a panel that loads nothing from the service until the visitor
// consents to it.
//
// The panel is a figure with a sentence that the site's script has not
// run, a link to the address, which leads to the service, and the
// service's player in a <template>, whose content a browser does not load.
// The integration's script (embedPanels() in src/consent/client.js) takes
// the sentence away: it loads the player in the panel's place once the
// visitor allows the service, and until then makes the panel the consent
// placeholder. Without JavaScript,
// or when the script fails to load, the panel keeps its sentence and its
// link, and loads nothing.
//
// Which addresses a service takes, and the player each one gives, is the
// rule data's (format/rules.json, `embeds`), read with embedOf().

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueFor, text } from '../catalogues.js';
import { embedOf } from '../format/embeds.js';
import rules from '../format/rules.json' with { type: 'json' };

const element = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });

// A panel's sentence that the site's script has not run, for a site in
// `locale` (British English for null), from the catalogues (ADR 0066).
export function noScriptSentence(locale = null) {
  return text(catalogueFor(locale), 'site.embed.noScript');
}

// The panel for an address, as a hast element, its sentence in the language
// of a site in `locale` (English for null); null for an address the site
// does not embed. It carries Konzilo's own class, which the script finds it
// by.
export function embedElement(address, locale = null) {
  const embed = embedOf(address, rules);
  if (embed.reason) return null;
  const size = embed.height ? `height: ${embed.height}px` : `aspect-ratio: ${embed.ratio}`;
  const player = element('iframe', {
    src: embed.player,
    title: embed.name,
    ...(embed.allow ? { allow: embed.allow } : {}),
    allowFullScreen: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    style: `display: block; width: 100%; ${size}; border: 0`,
  });
  return element('figure', { className: ['konzilo-embed'], dataEmbed: embed.service }, [
    element('p', { className: ['konzilo-embed-no-script'] }, [{ type: 'text', value: noScriptSentence(locale) }]),
    element('a', { href: address }, [{ type: 'text', value: address }]),
    element('template', {}, [player]),
  ]);
}

// What each service's players are given of the page's permissions: the origins they load from, by the rule data's `player` of each
// form, and the features of the permissions policy, those the service's
// `allow` names and fullscreen, which `allowFullScreen` above gives every
// player. The public site's permissions policy gives each of these features
// to these origins, so that the frame's delegation holds.
export function playerPermissions(services = rules.embeds.services) {
  return Object.values(services).map((service) => ({
    origins: [...new Set(service.addresses.map(({ player }) => new URL(player).origin))],
    features: [...new Set(['fullscreen', ...(service.allow ?? '').split(';').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean)])],
  }));
}

// The address a paragraph holds, when it holds nothing but a link whose text
// is its own address: `https://…` on a line of its own, or `<https://…>`.
function loneAddress(paragraph) {
  const [link, ...rest] = paragraph.children;
  if (rest.length > 0 || link?.type !== 'element' || link.tagName !== 'a') return null;
  if (Object.keys(link.properties).join() !== 'href') return null;
  const [text, ...more] = link.children;
  return more.length === 0 && text?.type === 'text' && text.value === link.properties.href ? text.value : null;
}

// Sätteri's HTML tree plugin that turns such a paragraph into its panel,
// for a site in `locale`. On a site in several `languages`, a
// panel in a content file in a language's folder, content/<collection>/<tag>/,
// is in that language. The plugin names the languages: Astro keeps a body
// it rendered until the body or the site's configuration changes, and the
// plugins are part of the configuration, so a site that changes its
// languages gets every panel again in the new ones.
export function embedsIn(locale, languages = []) {
  return {
    name: 'konzilo-embeds',
    language: locale,
    languages: languages.map((language) => language.locale),
    element: {
      filter: ['p'],
      visit(node, ctx) {
        const address = loneAddress(node);
        const panel = address && embedElement(address, fileLanguage(ctx.fileURL, languages) ?? locale);
        if (panel) ctx.replaceNode(node, panel);
      },
    },
  };
}

// The locale of the language whose folder a content file is in, on a site
// in several languages, or null.
function fileLanguage(fileURL, languages) {
  if (languages.length <= 1 || fileURL === undefined) return null;
  const folders = decodeURIComponent(fileURL.pathname).split('/').slice(0, -1);
  return languages.find((language) => folders.includes(language.tag))?.locale ?? null;
}

// The pages of a built site with an embed and nothing to ask for consent with, whose visitors get
// its bare address: the question stands in ConsentBanner.astro, which a site's layout places.
export function pagesWithBareEmbeds(dir) {
  const release = fileURLToPath(dir);
  return readdirSync(release, { recursive: true })
    .filter((path) => path.endsWith('.html'))
    .filter((path) => {
      const html = readFileSync(join(release, path), 'utf8');
      return html.includes('class="konzilo-embed"') && !html.includes('data-konzilo-consent-placeholder');
    })
    .sort();
}
