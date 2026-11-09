// The consent's browser client: the scripts that keep the visitor's choice
// and give the consent signal on a page that holds the consent's markup
// (markup.js), fill in the cookie declaration, and make each embed's panel a
// placeholder until its service is allowed.
//
// Each function runs in the visitor's browser and uses nothing from this
// module or any other, so that it can be put into a script file as its
// source, `(${consentClient})(options)`, as Konzilo's page script and the
// per-language consent script (script.js) put it, or called from a module
// a site bundles itself. startConsent() calls them all, in their order.
//
// This folder imports nothing outside itself.

// Every part of the client on a page, in the order they read each other:
// the consent client with `options` (consentClient()), the declaration, the
// placeholders and Datawrapper's heights.
export function startConsent(options = {}) {
  consentClient(options);
  cookieDeclaration();
  embedPanels();
  datawrapperHeights();
}

// The consent client: it reads the registry the consent's markup holds in
// `[data-konzilo-consent]` (its revision, its categories with their
// services, the storage withdrawing removes and the language of the page's
// texts), shows the banner while no choice holds, but on a legal page,
// opens the dialog, keeps each choice, and gives the consent signal,
// window.konziloConsent, and its event, `konzilo:consent` on the document.
// A page without the markup allows nothing beyond the necessary. A choice
// older than `months` is removed as the page loads, so the next choice has
// a new consent ID. Each element marked `data-konzilo-consent-host` gets
// the page's host, which an item stored on it is named by.
//
// `options`:
// - `name`: the consent's own storage item, in local storage,
//   `konzilo-consent` by default;
// - `months`: how long a choice holds, a refusal too, 12 by default;
// - `records`: the address the record of each choice is sent to, or null,
//   the default, where none is sent, as on a page no visitor sees. Without
//   it the client makes and keeps no consent ID, which nobody could look
//   up: the choice holds its time, the revision and the states alone;
// - `legalPage`: true on the privacy policy or the cookie policy, where the
//   banner stays hidden, so that it covers nothing the visitor wants to
//   read before choosing; the footer controls work there. The markup says
//   so too (`legalPage` in its registry), and so does a page of its own
//   with `<meta name="konzilo-consent" content="legal-page">` in its head.
//
// It sends the record of each choice in the background, and never waits
// for it: the consent ID, the choice's time, the revision, every state, how
// the choice was made (the part, `how`, and its control), the page's path
// and the language of the texts it showed. Until the endpoint has stored
// it, each record waits beside the choice, in the list `unsent`, and a later
// page view sends each once more and then gives it up; the choice holds
// regardless.
export function consentClient({ name = 'konzilo-consent', months = 12, records = null, legalPage = false } = {}) {
  // The page has its signal already, from an earlier run of the script.
  if ('konziloConsent' in window) return;
  const root = document.querySelector('[data-konzilo-consent]');
  let registry = { revision: null, categories: {}, storage: {} };
  try {
    if (root) registry = JSON.parse(root.dataset.konziloConsent);
  } catch {
    // A page with a broken registry allows nothing beyond the necessary.
  }
  const categoryOf = new Map(Object.entries(registry.categories).flatMap(([category, services]) => services.map((service) => [service, category])));
  const banner = root?.querySelector('.konzilo-consent-banner') ?? null;
  const notice = root?.querySelector('.konzilo-consent-notice') ?? null;
  const dialog = root?.querySelector('dialog') ?? null;
  const onLegalPage = legalPage === true || registry.legalPage === true || document.querySelector('meta[name="konzilo-consent"][content="legal-page"]') !== null;
  for (const element of document.querySelectorAll('[data-konzilo-consent-host]')) element.textContent = location.hostname;

  // The choice kept in the browser, whether it holds or not, or null: a
  // consent ID where it has one, and a time.
  const kept = () => {
    try {
      const choice = JSON.parse(localStorage.getItem(name));
      return choice && typeof choice.time === 'string' && (choice.id === undefined || typeof choice.id === 'string') ? choice : null;
    } catch {
      return null;
    }
  };

  // Whether a kept choice is older than `months`, the consent's own
  // storage's lifetime.
  const expired = (choice) => {
    const until = new Date(choice.time);
    until.setUTCMonth(until.getUTCMonth() + months);
    return !(Date.now() < until.getTime());
  };
  // A kept choice holds for the registry's revision, `months` from when it
  // was made.
  const holds = (choice) => Boolean(choice) && choice.revision === registry.revision
    && typeof choice.services === 'object' && choice.services !== null && !expired(choice);

  // A consent ID only where records name it.
  const identified = typeof records === 'string';
  // The choice alone, without the records that wait beside it, and without
  // a consent ID on a page that sends no records.
  const own = ({ unsent, ...rest }) => {
    if (identified) return rest;
    const { id, ...anonymous } = rest;
    return anonymous;
  };
  const keep = (value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Storage refused: the choice holds on this page alone.
    }
  };

  // A choice older than its lifetime is gone, its consent ID with it: the
  // next choice has a new one.
  if (kept() && expired(kept())) {
    try {
      localStorage.removeItem(name);
    } catch {
      // Storage refused: nothing was kept.
    }
  }

  let choice = holds(kept()) ? own(kept()) : null;
  // A copy of the choice, for code of the page's that may change what it
  // is handed.
  const copy = (value) => JSON.parse(JSON.stringify(value));

  // The records that wait beside the kept choice, each as it is sent.
  const unsent = (value) => (Array.isArray(value?.unsent) ? value.unsent : []);
  // The record of a choice, sent to the endpoint without waiting for it.
  // Once the endpoint has stored it, it no longer waits beside the choice;
  // every other record that waits still does. A page without the registry
  // has nothing a record could name.
  const sending = typeof records === 'string' && typeof fetch === 'function' && typeof registry.revision === 'string' && typeof registry.language === 'string';
  const send = (record) => {
    const stored = () => {
      const now = kept();
      if (!now) return;
      const left = unsent(now).filter((other) => other.id !== record.id || other.chosen !== record.chosen);
      keep(left.length > 0 ? { ...own(now), unsent: left } : own(now));
    };
    // The answer's body is read, so that the request ends: a browser keeps
    // one whose body nobody reads open.
    try {
      fetch(records, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), keepalive: true })
        .then((answer) => {
          if (answer.status === 204) stored();
          return answer.text();
        })
        .catch(() => {});
    } catch {
      // The browser refused to send it: it waits for a later page view.
    }
  };
  // The records that wait from an earlier page are sent once more, and then
  // given up.
  const waiting = kept();
  if (sending && unsent(waiting).length > 0) {
    keep(own(waiting));
    for (const record of unsent(waiting)) send(record);
  }

  // A necessary service is always allowed; any other once the visitor
  // allowed it, by its category or on its own.
  const allowsService = (service) => categoryOf.get(service) === 'necessary' || choice?.services[service] === true;
  const allowsCategory = (category) => category === 'necessary' || choice?.categories?.[category] === true;

  // A random consent ID, made with the first choice and kept with every
  // later one: a version 4 UUID.
  const newId = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  // The storage items withdrawing removes, a `*` in a name standing for
  // any characters.
  const matcher = (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  const remove = ({ name: pattern, kind }) => {
    const matches = matcher(pattern);
    if (kind === 'cookie') {
      const found = document.cookie.split(';').map((pair) => pair.split('=')[0].trim()).filter((cookie) => matches.test(cookie));
      const parts = location.hostname.split('.');
      const domains = ['', ...parts.map((_, index) => parts.slice(index).join('.'))];
      const segments = location.pathname.split('/');
      const paths = new Set(['/', ...segments.map((_, index) => segments.slice(0, index + 1).join('/')).filter(Boolean)]);
      for (const cookie of found) {
        for (const domain of domains) {
          for (const path of paths) document.cookie = `${cookie}=; Max-Age=0; Path=${path}${domain ? `; Domain=${domain}` : ''}`;
        }
      }
      return;
    }
    const area = kind === 'localStorage' ? localStorage : sessionStorage;
    for (let index = area.length - 1; index >= 0; index -= 1) {
      const key = area.key(index);
      if (key !== null && matches.test(key)) area.removeItem(key);
    }
  };

  // The visitor allows exactly `allowed`, the ids of services, and the
  // necessary ones; a category is allowed when each of its services is.
  // `how`: banner, dialog, placeholder or withdrawal; `control`: accept,
  // reject, save, allow or withdraw.
  //
  // A choice that withdraws consent, to every optional service with
  // Withdraw consent or to some of them in the dialog, removes what each
  // service withdrawn from stored that the page can reach, after the event,
  // and reloads the page, so that none of their code keeps running.
  // Withdraw consent shows the notice in the banner's place first, and
  // reloads two seconds later; the banner does not come back, since the
  // choice of the necessary alone holds.
  const choose = (allowed, how, control) => {
    const before = [...categoryOf.keys()].filter(allowsService);
    const services = Object.fromEntries([...categoryOf].map(([service, category]) => [service, category === 'necessary' || allowed.has(service)]));
    const categories = Object.fromEntries(Object.entries(registry.categories).map(([category, ids]) => [category, ids.every((id) => services[id])]));
    const last = kept();
    // Each choice is later than the last, even two in one millisecond, so
    // that its time tells its record from any other of its consent ID.
    const time = new Date(Math.max(Date.now(), (Date.parse(last?.time) || 0) + 1)).toISOString();
    choice = { ...(identified ? { id: last?.id ?? newId() } : {}), time, revision: registry.revision, categories, services };
    if (sending) {
      const record = { id: choice.id, chosen: time, revision: registry.revision, categories, services, how, control, path: location.pathname, language: registry.language };
      keep({ ...choice, unsent: [...unsent(last), record] });
      send(record);
    } else {
      keep(choice);
    }
    if (banner) banner.hidden = true;
    document.dispatchEvent(new CustomEvent('konzilo:consent', { detail: { choice: copy(choice), how } }));
    const withdrawn = how === 'withdrawal' ? Object.keys(registry.storage) : before.filter((service) => !allowsService(service));
    if (how !== 'withdrawal' && withdrawn.length === 0) return;
    for (const service of withdrawn) {
      for (const item of registry.storage[service] ?? []) remove(item);
    }
    if (how !== 'withdrawal') {
      location.reload();
      return;
    }
    if (notice) notice.hidden = false;
    setTimeout(() => location.reload(), 2000);
  };
  const withdraw = () => choose(new Set(), 'withdrawal', 'withdraw');

  // The dialog's switches, set to what the visitor allows; a category's is
  // on when each of its services' is.
  const switches = (selector) => (dialog ? [...dialog.querySelectorAll(selector)] : []);
  const sync = () => {
    for (const input of switches('input[data-konzilo-consent-category]:not(:disabled)')) {
      const inCategory = switches(`input[data-konzilo-consent-service][data-konzilo-consent-in="${input.dataset.konziloConsentCategory}"]`);
      input.checked = inCategory.length > 0 && inCategory.every((service) => service.checked);
    }
  };
  let opener = null;
  const open = () => {
    if (!dialog || dialog.open) return;
    for (const input of switches('input[data-konzilo-consent-service]')) input.checked = allowsService(input.dataset.konziloConsentService);
    sync();
    opener = document.activeElement;
    dialog.showModal();
  };
  dialog?.addEventListener('close', () => {
    if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
    opener = null;
  });
  // A modal dialog leaves the rest of the page inert, but lets Tab go on to
  // the browser's own controls: past its last control the focus goes back
  // to its first, and the other way round.
  dialog?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button, input, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((control) => !control.disabled && control.getClientRects().length > 0);
    const [first, last] = [controls[0], controls.at(-1)];
    if (!first) return;
    if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  dialog?.addEventListener('change', (event) => {
    const category = event.target.dataset?.konziloConsentCategory;
    if (category) {
      for (const input of switches(`input[data-konzilo-consent-service][data-konzilo-consent-in="${category}"]`)) input.checked = event.target.checked;
    }
    sync();
  });

  const everything = () => new Set(categoryOf.keys());
  const allowed = () => new Set([...categoryOf.keys()].filter(allowsService));
  const actions = {
    accept: (how) => choose(everything(), how, 'accept'),
    reject: (how) => choose(new Set(), how, 'reject'),
    save: () => choose(new Set(switches('input[data-konzilo-consent-service]:checked').map((input) => input.dataset.konziloConsentService)), 'dialog', 'save'),
  };
  document.addEventListener('click', (event) => {
    const pressed = event.target.closest?.('[data-konzilo-consent-action]');
    if (!pressed) return;
    const action = pressed.dataset.konziloConsentAction;
    const inDialog = dialog?.contains(pressed) ?? false;
    if (action === 'customise' || action === 'change') open();
    else if (action === 'withdraw') withdraw();
    else if (action === 'close') dialog?.close();
    else if (actions[action]) {
      actions[action](inDialog ? 'dialog' : 'banner');
      if (inDialog) dialog.close();
    }
  });

  // The consent signal.
  Object.defineProperty(window, 'konziloConsent', {
    value: Object.freeze({
      category: (category) => allowsCategory(category),
      service: (service) => allowsService(service),
      choice: () => (choice ? copy(choice) : null),
      allow: (service, how = 'placeholder') => {
        if (categoryOf.has(service)) choose(new Set([...allowed(), service]), how, 'allow');
      },
    }),
  });

  // Without JavaScript neither the banner nor the footer's buttons show;
  // with it, the buttons, and the banner while no choice holds, but on a
  // legal page.
  if (dialog) {
    for (const hidden of document.querySelectorAll('button[data-konzilo-consent-action][hidden]')) hidden.hidden = false;
  }
  if (banner && !choice && !onLegalPage) banner.hidden = false;
}

// The cookie declaration's script. On a page with the declaration it shows
// the visitor's own consent from the consent signal: the consent ID where
// the declaration has its place, when the choice was made, in the page's
// language, and what it allows, each category it allows wholly and each
// service it allows in a category it does not; or that no choice holds. It
// hides the sentence that says the script has not run, and follows each
// later choice. The buttons beside it are the consent client's, which shows
// them.
export function cookieDeclaration() {
  const root = document.querySelector('[data-konzilo-declaration]');
  const consent = window.konziloConsent;
  const choice = root?.querySelector('.konzilo-declaration-choice');
  if (!consent || !choice) return;
  const none = root.querySelector('.konzilo-declaration-none');
  const id = choice.querySelector('[data-konzilo-declaration-id]');
  const time = choice.querySelector('[data-konzilo-declaration-time]');
  const show = () => {
    const current = consent.choice();
    none.hidden = current !== null;
    choice.hidden = current === null;
    if (!current) return;
    if (id) id.textContent = current.id;
    time.dateTime = current.time;
    time.textContent = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(current.time));
    for (const item of choice.querySelectorAll('[data-konzilo-declaration-category]')) {
      item.hidden = current.categories[item.dataset.konziloDeclarationCategory] !== true;
    }
    for (const item of choice.querySelectorAll('[data-konzilo-declaration-service]')) {
      item.hidden = current.services[item.dataset.konziloDeclarationService] !== true || current.categories[item.dataset.konziloDeclarationIn] === true;
    }
  };
  root.querySelector('.konzilo-declaration-no-script').hidden = true;
  show();
  document.addEventListener('konzilo:consent', show);
}

// The embeds' panels' script, after the consent client's, whose signal,
// window.konziloConsent, it reads. A panel is the markup of ADR 0024,
// `<figure class="konzilo-embed" data-embed="<service>">` with the
// service's player in a <template>. A panel of a service the visitor allows
// loads its player in its place at once, and one the visitor comes to allow
// the moment the signal says so, without a reload. Any other panel asks for
// consent to its service: the consent's markup holds a <template> per such
// service with the question, the sentence on what the service stores and
// the button, which the script puts before the panel's link. The button
// allows that service alone, as given in a placeholder, which loads every
// panel of it on the page and gives the focus to the player of the panel
// pressed. A panel of a service with no such template keeps its link alone.
export function embedPanels() {
  const consent = window.konziloConsent;
  const asks = new Map([...document.querySelectorAll('[data-konzilo-consent] > template[data-konzilo-consent-placeholder]')]
    .map((template) => [template.dataset.konziloConsentPlaceholder, template]));
  const waiting = () => [...document.querySelectorAll('figure.konzilo-embed[data-embed]')].filter((panel) => panel.querySelector(':scope > template'));

  const load = (panel) => {
    const player = panel.querySelector(':scope > template').content.querySelector('iframe');
    if (player) panel.replaceChildren(player.cloneNode(true));
  };
  const ask = (panel) => {
    panel.querySelector(':scope > .konzilo-embed-no-script')?.remove();
    const placeholder = asks.get(panel.dataset.embed);
    if (placeholder && !panel.querySelector(':scope > .konzilo-embed-allow')) panel.prepend(placeholder.content.cloneNode(true));
  };
  const show = () => {
    for (const panel of waiting()) {
      if (consent?.service(panel.dataset.embed)) load(panel);
      else ask(panel);
    }
  };

  document.addEventListener('click', (event) => {
    const allow = event.target.closest?.('figure.konzilo-embed > .konzilo-embed-allow');
    if (!allow) return;
    const panel = allow.parentElement;
    consent?.allow(panel.dataset.embed);
    panel.querySelector(':scope > iframe')?.focus();
  });
  document.addEventListener('konzilo:consent', show);
  show();
}

// The script that lets a loaded Datawrapper chart set its own height, as
// Datawrapper's own embed code listens for its messages.
export function datawrapperHeights() {
  window.addEventListener('message', (event) => {
    const heights = event.origin === 'https://datawrapper.dwcdn.net' ? event.data?.['datawrapper-height'] : undefined;
    if (!heights || typeof heights !== 'object') return;
    for (const player of document.querySelectorAll('figure.konzilo-embed > iframe')) {
      if (player.contentWindow !== event.source) continue;
      for (const height of Object.values(heights)) if (Number(height) > 0) player.style.height = `${Number(height)}px`;
    }
  });
}
