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
// the consent client with `options` (consentClient()), Matomo's tracker
// with `options.matomo` where it is given, and the statistics departure,
// `options.statistics`, { withoutStorage, privacySignals }, with it
// (matomoTracker()), the declaration, the placeholders and Datawrapper's
// heights.
export function startConsent(options = {}) {
  consentClient(options);
  matomoTracker(options.matomo ? { ...options.statistics, ...options.matomo } : null);
  cookieDeclaration();
  embedPanels();
  datawrapperHeights();
}

// The consent's markup on a page that does not render it itself, as the
// consent script (script.js) gives it: `consent`, the banner, the notice,
// the dialogs and the placeholders' templates (consentMarkup()), at the end
// of the body, unless the page holds them already; and `declaration`, the
// cookie declaration (cookieDeclarationMarkup()), in place of what each
// element marked `data-konzilo-consent-declaration` holds, which stays
// where the script does not run.
//
// The page may name its own privacy policy and cookie policy, in its head:
// `<link rel="privacy-policy" href="…">`, the link type registered for it,
// and `<link rel="cookie-policy" href="…">`, which mirrors it, each with an
// optional `title`. Each link of the markup to that policy, marked
// `data-konzilo-consent-policy` with the link type, then leads there, and
// says the title where the page gives one; else it keeps the address and
// the title the script was made with.
export function placeConsent(consent, declaration) {
  const parse = (html) => {
    const parsed = document.createElement('template');
    parsed.innerHTML = html;
    const own = (rel) => document.querySelector(`link[rel~="${rel}" i][href]`);
    const places = [parsed.content, ...[...parsed.content.querySelectorAll('template')].map((template) => template.content)];
    for (const link of places.flatMap((place) => [...place.querySelectorAll('a[data-konzilo-consent-policy]')])) {
      const policy = own(link.dataset.konziloConsentPolicy);
      if (!policy) continue;
      link.href = policy.href;
      if (policy.title) link.textContent = policy.title;
    }
    return parsed.content;
  };
  if (!document.querySelector('[data-konzilo-consent]')) document.body.append(parse(consent));
  for (const place of document.querySelectorAll('[data-konzilo-consent-declaration]')) place.replaceChildren(parse(declaration));
}

// The consent client: it reads the registry the consent's markup holds in
// `[data-konzilo-consent]` (its revision, its categories with their
// services, the storage withdrawing removes and the language of the page's
// texts), shows the banner while no choice holds, but on a legal page,
// opens the dialog, keeps each choice, and gives the consent signal,
// window.konziloConsent, and its event, `konzilo:consent` on the document.
// A page without the markup allows nothing beyond the necessary. A choice
// older than `months` is removed as the page loads, so the next choice has
// a new consent ID. Every page removes, as it loads, what each optional
// service the choice does not allow stored that the page reaches, so that
// what one site below a shared domain stored is gone at the next page view
// on another after the visitor withdrew there. Each element marked
// `data-konzilo-consent-host` gets the page's host, which an item stored
// on it is named by.
//
// Where the registry offers it (`objection` in its data), the visitor may
// object to the statistics counting the visit without storage, on the
// departure statisticsWithoutStorageBeforeConsent: each link marked
// `data-konzilo-consent-action="objection"` says *Don't count my visits* and
// opens the confirmation, `#konzilo-consent-objection`, with the appeal
// that fits, `data-konzilo-consent-appeal` `with-statistics` where the
// visitor allows statistics, else `without-statistics`, whose `object`
// button objects; once the visitor objects, the link says *Count my visits
// again*, and takes the objection back at once. The objection is kept
// beside the choice, in the same item, for `months`, whether a choice holds
// or not: `{ …choice, objection }`, `objection` the time it was made, or
// `{ objection }` alone before any choice. It withdraws consent to every
// statistics service the choice allowed, as a choice of its own, and is not
// a consent: it makes no consent ID and changes no revision. A choice that
// allows a statistics service ends it, and so does Withdraw consent; a new
// consent revision does not. The signal's `objected()` says whether the
// visitor objects, and the event comes at every change of it too.
//
// `options`:
// - `name`: the consent's own storage item, in local storage,
//   `konzilo-consent` by default;
// - `months`: how long a choice holds, a refusal too, 12 by default;
// - `domain`: a domain the page's host is at or below, such as example.com,
//   to keep the choice in a cookie of the name `name` on it, which every
//   site below the domain reads and writes, `Path=/`, `Secure` and
//   `SameSite=Lax`, readable by script, for as long as the choice holds;
//   the records that wait to be sent stay in the local storage item. Null,
//   the default, keeps the choice in the local storage item, the page's
//   origin's own. A choice kept the other way is not carried over;
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
export function consentClient({ name = 'konzilo-consent', months = 12, domain = null, records = null, legalPage = false } = {}) {
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
  const dialog = root?.querySelector('dialog.konzilo-consent-dialog') ?? root?.querySelector('dialog') ?? null;
  // The confirmation of an objection, and the words of its links, where the
  // registry offers the right to object.
  const offered = registry.objection && typeof registry.objection === 'object' ? registry.objection : null;
  const confirmation = offered ? root?.querySelector('dialog#konzilo-consent-objection') ?? null : null;
  const statistics = Array.isArray(registry.categories.statistics) ? registry.categories.statistics : [];
  const onLegalPage = legalPage === true || registry.legalPage === true || document.querySelector('meta[name="konzilo-consent"][content="legal-page"]') !== null;
  for (const element of document.querySelectorAll('[data-konzilo-consent-host]')) element.textContent = location.hostname;

  // Where the choice is kept: in the local storage item, or in a cookie on
  // the shared domain, with the records that wait in the local item.
  const shared = typeof domain === 'string' && domain !== '';
  // When a choice or an objection made at `time` stops holding: `months`
  // later.
  const until = (time) => {
    const date = new Date(time);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date;
  };
  // The later of a kept value's choice and objection, which its cookie
  // lasts from.
  const latest = (value) => new Date(Math.max(Date.parse(value.time) || 0, Date.parse(value.objection) || 0)).toISOString();
  const local = () => {
    try {
      return JSON.parse(localStorage.getItem(name));
    } catch {
      return null;
    }
  };
  const cookie = () => {
    try {
      const pair = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
      return pair ? JSON.parse(decodeURIComponent(pair.slice(name.length + 1))) : null;
    } catch {
      return null;
    }
  };
  // A choice has a time, and a consent ID where it has one; an objection
  // alone has its own time and nothing else of a choice.
  const valid = (value) => {
    if (!value || typeof value !== 'object') return null;
    if (typeof value.time === 'string') return value.id === undefined || typeof value.id === 'string' ? value : null;
    return value.time === undefined && typeof value.objection === 'string' ? value : null;
  };
  // The choice kept in the browser, whether it holds or not, with the
  // records that wait beside it, or null.
  const kept = () => {
    if (!shared) return valid(local());
    const found = valid(cookie());
    const waiting = local()?.unsent;
    return found && Array.isArray(waiting) ? { ...found, unsent: waiting } : found;
  };
  const toLocal = (value) => {
    try {
      if (value === null) localStorage.removeItem(name);
      else localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Storage refused: the choice holds on this page alone.
    }
  };
  const toCookie = (value) => {
    const attributes = `; Domain=${domain}; Path=/; Secure; SameSite=Lax`;
    document.cookie = value === null
      ? `${name}=; Max-Age=0${attributes}`
      : `${name}=${encodeURIComponent(JSON.stringify(value))}; Expires=${until(latest(value)).toUTCString()}${attributes}`;
  };

  // Whether a choice or an objection made at `time` is older than `months`,
  // the consent's own storage's lifetime.
  const expired = (time) => !(Date.now() < until(time).getTime());
  // A kept choice holds for the registry's revision, `months` from when it
  // was made.
  const holds = (choice) => Boolean(choice) && typeof choice.time === 'string' && choice.revision === registry.revision
    && typeof choice.services === 'object' && choice.services !== null && !expired(choice.time);

  // A consent ID only where records name it.
  const identified = typeof records === 'string';
  // What is kept, without the records that wait beside it, and without a
  // consent ID on a page that sends no records.
  const own = ({ unsent, ...rest }) => {
    if (identified) return rest;
    const { id, ...unnamed } = rest;
    return unnamed;
  };
  // The choice alone, without the objection beside it.
  const choiceOf = (value) => {
    const { objection: _, ...alone } = own(value);
    return alone;
  };
  // The objection a kept value holds, the time it was made, or null.
  const objectionOf = (value) => (typeof value?.objection === 'string' && !expired(value.objection) ? value.objection : null);
  // Keep `value`, a choice, an objection or both, or nothing where it holds
  // neither.
  const keep = (value) => {
    const empty = value === null || (typeof value.time !== 'string' && typeof value.objection !== 'string');
    if (!shared) {
      toLocal(empty ? null : value);
      return;
    }
    const { unsent: waiting, ...alone } = empty ? {} : value;
    toCookie(empty ? null : alone);
    toLocal(Array.isArray(waiting) && waiting.length > 0 ? { unsent: waiting } : null);
  };

  // A choice older than its lifetime is gone, its consent ID and its
  // waiting records with it: the next choice has a new one. So is an
  // objection older than its own; either may outlive the other.
  const stale = kept();
  if (stale) {
    const choiceGone = typeof stale.time === 'string' && expired(stale.time);
    const objectionGone = typeof stale.objection === 'string' && expired(stale.objection);
    if (choiceGone || objectionGone) {
      const { objection: left, ...rest } = stale;
      const objectionLeft = objectionGone ? {} : (typeof left === 'string' ? { objection: left } : {});
      keep(choiceGone ? { ...objectionLeft } : { ...rest, ...objectionLeft });
    }
  }

  let choice = holds(kept()) ? choiceOf(kept()) : null;
  let objection = objectionOf(kept());
  // A copy of the choice, for code of the page's that may change what it
  // is handed.
  const copy = (value) => JSON.parse(JSON.stringify(value));

  // The records that wait beside the kept choice, each as it is sent.
  const unsent = (value) => (Array.isArray(value?.unsent) ? value.unsent : []);
  // The record of a choice, sent to the endpoint without waiting for it.
  // Once the endpoint has stored it, it no longer waits beside the choice;
  // every other record that waits still does. A page without the registry
  // has nothing a record could name. An objection alone is no choice, and
  // sends none.
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

  // What each optional service the choice does not allow stored that the
  // page reaches goes, on every page.
  for (const service of Object.keys(registry.storage)) {
    if (!allowsService(service)) for (const item of registry.storage[service]) remove(item);
  }

  // The visitor allows exactly `allowed`, the ids of services, and the
  // necessary ones; a category is allowed when each of its services is.
  // `how`: banner, dialog, placeholder, withdrawal or objection; `control`:
  // accept, reject, save, allow, withdraw or object. A choice that allows a
  // statistics service ends the objection, and so does a withdrawal.
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
    if (how === 'withdrawal' || statistics.some((service) => services[service] === true)) objection = null;
    const value = objection ? { ...choice, objection } : choice;
    if (sending) {
      const record = { id: choice.id, chosen: time, revision: registry.revision, categories, services, how, control, path: location.pathname, language: registry.language };
      keep({ ...value, unsent: [...unsent(last), record] });
      send(record);
    } else {
      keep(value);
    }
    if (banner) banner.hidden = true;
    showObjection();
    document.dispatchEvent(new CustomEvent('konzilo:consent', { detail: { choice: copy(choice), how, objected: objection !== null } }));
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

  // The links that object, or take the objection back: each says which it
  // does now, and shows where the registry offers the right to object.
  function showObjection() {
    for (const link of document.querySelectorAll('[data-konzilo-consent-action="objection"]')) {
      if (!offered) continue;
      link.textContent = objection ? offered.resume : offered.object;
      link.hidden = false;
    }
  }
  // The visitor objects: kept beside whatever is kept, at once, and with
  // consent to statistics withdrawn where the choice gave it, which is a
  // choice of its own, recorded as one, that reloads the page.
  const object = () => {
    const last = kept();
    objection = new Date(Math.max(Date.now(), (Date.parse(last?.objection) || 0) + 1)).toISOString();
    for (const input of switches('input[data-konzilo-consent-service]')) {
      if (statistics.includes(input.dataset.konziloConsentService)) input.checked = false;
    }
    sync();
    if (statistics.some(allowsService)) {
      choose(new Set([...allowed()].filter((service) => !statistics.includes(service))), 'objection', 'object');
      return;
    }
    keep({ ...(last ?? {}), objection });
    showObjection();
    document.dispatchEvent(new CustomEvent('konzilo:consent', { detail: { choice: choice ? copy(choice) : null, how: 'objection', objected: true } }));
  };
  // The appeal the confirmation makes: to a visitor who allows statistics,
  // whose cookie recognises the browser, the one that says so, else the
  // other; the dialog is described by the one it shows.
  const appeal = () => {
    const allows = statistics.some(allowsService);
    for (const text of confirmation.querySelectorAll('[data-konzilo-consent-appeal]')) {
      text.hidden = (text.dataset.konziloConsentAppeal === 'with-statistics') !== allows;
      if (!text.hidden && text.id) confirmation.setAttribute('aria-describedby', text.id);
    }
  };
  // The visitor takes the objection back; what else is kept stays.
  const resume = () => {
    objection = null;
    const { objection: _, ...rest } = kept() ?? {};
    keep(rest);
    showObjection();
    document.dispatchEvent(new CustomEvent('konzilo:consent', { detail: { choice: choice ? copy(choice) : null, how: 'objection', objected: false } }));
  };

  // The dialog's switches, set to what the visitor allows; a category's is
  // on when each of its services' is.
  const switches = (selector) => (dialog ? [...dialog.querySelectorAll(selector)] : []);
  const sync = () => {
    for (const input of switches('input[data-konzilo-consent-category]:not(:disabled)')) {
      const inCategory = switches(`input[data-konzilo-consent-service][data-konzilo-consent-in="${input.dataset.konziloConsentCategory}"]`);
      input.checked = inCategory.length > 0 && inCategory.every((service) => service.checked);
    }
  };
  // Each dialog gives the focus back, as it closes, to what had it when it
  // opened. A modal dialog leaves the rest of the page inert, but lets Tab
  // go on to the browser's own controls: past its last control the focus
  // goes back to its first, and the other way round.
  const openers = new Map();
  const modal = (element) => {
    if (!element) return;
    element.addEventListener('close', () => {
      const opener = openers.get(element);
      if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
      openers.delete(element);
    });
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = [...element.querySelectorAll('a[href], button, input, summary, [tabindex]:not([tabindex="-1"])')]
        .filter((control) => !control.disabled && !control.closest('[hidden]') && control.getClientRects().length > 0);
      const [first, last] = [controls[0], controls.at(-1)];
      if (!first) return;
      if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    });
  };
  const show = (element) => {
    openers.set(element, document.activeElement);
    element.showModal();
  };
  modal(dialog);
  modal(confirmation);
  const open = () => {
    if (!dialog || dialog.open) return;
    for (const input of switches('input[data-konzilo-consent-service]')) input.checked = allowsService(input.dataset.konziloConsentService);
    sync();
    show(dialog);
  };
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
    else if (action === 'objection') {
      // A link: it goes nowhere but to the confirmation, or takes the
      // objection back.
      event.preventDefault();
      if (!offered) return;
      if (objection) resume();
      else if (confirmation && !confirmation.open) {
        appeal();
        show(confirmation);
      }
    } else if (action === 'object') {
      confirmation?.close();
      if (offered) object();
    } else if (action === 'cancel') confirmation?.close();
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
      objected: () => objection !== null,
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
  showObjection();
  if (banner && !choice && !onLegalPage) banner.hidden = false;
}

// Matomo's own tracker, a statistics service of the registry, after the
// consent client's, whose signal it reads. It loads, from the instance's
// own script file and with no inline code, once the signal allows its
// service, in the same page view, at once on a later page, and counts the
// page view. A withdrawal reloads the page, and a later page loads no
// tracker.
//
// With `withoutStorage`, the departure statisticsWithoutStorageBeforeConsent,
// it loads at once instead and counts as a web server's log would until the
// visitor allows statistics: it stores nothing in the browser and reads
// nothing of the device beyond what the browser sends with every request
// anyway. That is Matomo's requireCookieConsent, disableBrowserFeatureDetection
// and disablePerformanceTracking, and setCustomRequestProcessing, which
// puts the time of day in the site's time zone, `timeZone`, in place of
// the one Matomo reads from the device's clock in its own: left out, Matomo
// would record UTC. Once the signal allows its service it calls
// setCookieConsentGiven and enableBrowserFeatureDetection, in the same page
// view without a reload, and the time of day is the visitor's own from the
// next request on; the load times follow from the next page view, since
// Matomo cannot turn them back on in one. It does so on every later page
// view while the choice holds; a withdrawal calls forgetCookieConsentGiven
// and disableBrowserFeatureDetection, before the page reloads. With
// `privacySignals: 'stop'` a browser that sends Global Privacy Control or
// Do Not Track is not counted at all; with 'ignore' it is counted the same
// way.
//
// Where the visitor objects (the signal's `objected()`), it sends nothing:
// on a page where the objection holds it does not load, and where the
// visitor objects in the page view it calls requireConsent, which holds
// back every later request and sets no cookie, as Matomo's
// forgetConsentGiven and optUserOut would. A visitor who takes the
// objection back is counted from the next page view; one who allows
// statistics at once, by setConsentGiven.
//
// `config`: null, or { service, script, endpoint, site, cookieDomain,
// timeZone, withoutStorage, privacySignals }: the id of its service in the
// registry, the address of the instance's matomo.js and of its matomo.php,
// the site's ID in the instance, the domain the owner's sites below it are
// counted as one on, which it keeps its cookies on and counts as its own,
// or null for the page's host, the site's time zone by its IANA name, such
// as Europe/Paris, UTC where it is null or unknown, and the departure's two.
export function matomoTracker(config) {
  if (!config || 'konziloMatomo' in window) return;
  Object.defineProperty(window, 'konziloMatomo', { value: true });
  const signal = window.konziloConsent;
  const allowed = () => signal?.service(config.service) === true;
  // A signal older than the objection has none.
  const objected = () => typeof signal?.objected === 'function' && signal.objected() === true;
  const withoutStorage = config.withoutStorage === true;
  const signalled = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  if (withoutStorage && config.privacySignals === 'stop' && signalled) return;
  let loaded = false;
  let storing = false;
  let silenced = false;
  // Matomo's queue, one call to a push, as Matomo's own snippet does.
  const push = (...calls) => {
    window._paq = window._paq || [];
    for (const call of calls) window._paq.push(call);
  };
  // The time of day in the site's time zone, from the clock alone: no time
  // zone of the device's is read.
  const clock = (() => {
    const options = { hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' };
    try {
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: config.timeZone || 'UTC' });
    } catch {
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' });
    }
  })();
  // Each request's h, m and s, the time of day it was made, in the site's
  // time zone until the visitor allows statistics, then the visitor's own.
  const siteTime = (request) => {
    if (storing || typeof request !== 'string') return request;
    const now = Object.fromEntries(clock.formatToParts(new Date()).map(({ type, value }) => [type, String(Number(value))]));
    return request.replace(/(^|&)h=\d+/, `$1h=${now.hour}`).replace(/(^|&)m=\d+/, `$1m=${now.minute}`).replace(/(^|&)s=\d+/, `$1s=${now.second}`);
  };
  const store = () => {
    storing = true;
    push(['setCookieConsentGiven'], ['enableBrowserFeatureDetection']);
  };
  const forget = () => {
    storing = false;
    push(['forgetCookieConsentGiven'], ['disableBrowserFeatureDetection']);
  };
  const load = () => {
    loaded = true;
    if (withoutStorage) {
      push(['requireCookieConsent'], ['setCustomRequestProcessing', siteTime]);
      if (allowed()) store();
      else push(['disableBrowserFeatureDetection'], ['disablePerformanceTracking']);
    }
    if (config.cookieDomain) {
      push(['setCookieDomain', `*.${config.cookieDomain}`], ['setDomains', [`*.${config.cookieDomain}`]]);
    }
    push(['setTrackerUrl', config.endpoint], ['setSiteId', String(config.site)], ['trackPageView'], ['enableLinkTracking']);
    const script = document.createElement('script');
    script.async = true;
    script.src = config.script;
    document.head.append(script);
  };
  if (!objected() && (withoutStorage || allowed())) load();
  document.addEventListener('konzilo:consent', () => {
    if (!loaded) {
      if (allowed()) load();
      return;
    }
    if (objected()) {
      if (storing) forget();
      if (!silenced) push(['requireConsent']);
      silenced = true;
      return;
    }
    if (silenced) {
      if (!allowed()) return;
      push(['setConsentGiven']);
      silenced = false;
    }
    if (withoutStorage && allowed() && !storing) store();
    else if (withoutStorage && !allowed() && storing) forget();
  });
}

// The cookie declaration's script. On a page with the declaration it shows
// the visitor's own consent from the consent signal: the consent ID where
// the declaration has its place, when the choice was made, in the
// declaration's locale (`data-konzilo-declaration-locale`), and what it allows, each category it allows wholly and each
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
  // The declaration's own locale, which its other dates are in, else the
  // page's language.
  const locale = root.dataset.konziloDeclarationLocale || document.documentElement.lang || undefined;
  const id = choice.querySelector('[data-konzilo-declaration-id]');
  const time = choice.querySelector('[data-konzilo-declaration-time]');
  const show = () => {
    const current = consent.choice();
    none.hidden = current !== null;
    choice.hidden = current === null;
    if (!current) return;
    if (id) id.textContent = current.id;
    time.dateTime = current.time;
    time.textContent = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(current.time));
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
