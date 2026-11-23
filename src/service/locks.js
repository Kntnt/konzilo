// The locks of the editor's forms (ADR 0073): each form held by one tab at a time, which any other
// Editor's tab may take over. They live in the memory of the service's role for editors, since
// nothing of them outlasts the tabs that hold them: a restart forgets them, and each tab still open
// takes its own back at its next call, unless another tab has taken the form meanwhile, which that
// tab is then told as of a takeover.
//
// A form is named as the editor's address names it, `<collection>/<entry>`, such as
// `articles/aaaaaaaaaaaa`, `settings/settings` or `menus/main-en`; a tab by the name it gives
// itself as it loads.

// The forms only an Admin saves (ADR 0008), by their collection, as the editor's configuration
// names them (src/cms/config.js).
export const ADMINS_FORMS = new Set(['settings', 'menus']);

export const isForm = (form) => typeof form === 'string'
  && form.length <= 300
  && /^[A-Za-z0-9_-]+\/[\p{L}\p{N}._/-]+$/u.test(form)
  && !form.split('/').some((part) => part === '' || part === '.' || part === '..');

export const isTab = (tab) => typeof tab === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(tab);

export const isAdminsForm = (form) => ADMINS_FORMS.has(form.split('/')[0]);

// `now()`: the time, a Date. `alive`: how long after a tab last called its locks stand. A tab that
// has a form open calls at least each time its wait is up, so a lock ends within `alive` and a
// sweep after its tab stops answering, and never while it answers, however idle its holder.
//
// Gives { version, hold(form, person, tab, takeOver), release(form, tab), touch(tab), sweep(),
// list(), onChange(listener) }: `version`, a number that changes with each change to the locks;
// `hold` gives { held: { since } } where the form was free or is the tab's own, or where it takes
// it over, and { holder: { name, login, since } } where another tab holds it; `person` is
// { login, name }; `release` lets a form go where `tab` holds it; `touch` says the tab answers;
// `sweep` lets go every lock whose tab has stopped answering; `list` gives each lock, { form, tab,
// login, name, since }, `since` a Date; `onChange` calls `listener` at each change until the
// function it gives is called.
export function lockTable({ now = () => new Date(), alive = 90_000 } = {}) {
  const held = new Map();
  const seen = new Map();
  const listeners = new Set();
  let version = 1;
  const changed = () => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };
  const touch = (tab) => seen.set(tab, now().getTime());

  return {
    get version() {
      return version;
    },
    hold(form, { login, name }, tab, takeOver = false) {
      touch(tab);
      const lock = held.get(form);
      if (lock?.tab === tab) return { held: { since: lock.since } };
      if (lock && !takeOver) return { holder: { name: lock.name, login: lock.login, since: lock.since } };
      const since = now();
      held.set(form, { tab, login, name, since });
      changed();
      return { held: { since } };
    },
    release(form, tab) {
      if (held.get(form)?.tab !== tab) return;
      held.delete(form);
      changed();
    },
    touch,
    sweep() {
      const moment = now().getTime();
      let gone = false;
      for (const [form, { tab }] of held) {
        if (moment - (seen.get(tab) ?? 0) < alive) continue;
        held.delete(form);
        gone = true;
      }
      for (const [tab, at] of seen) if (moment - at >= alive) seen.delete(tab);
      if (gone) changed();
    },
    list: () => [...held].map(([form, lock]) => ({ form, ...lock })),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
