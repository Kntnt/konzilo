// Field groups in Sveltia (ADR 0071): the format that reads a post's source file into its
// groups and writes it back flat, the core's own field that draws a group of the core's fields
// with one menu over them all, and the checks at Save that a group's fields need.
//
// A group's field, `konzilo-group`, holds its fields' values as one object, and draws each field
// with the control of its own type, Sveltia's or the core's (`CMS.getFieldType`). Its settings in
// the configuration (config.js):
//   fields: [...]     the fields it covers, each as a field of its own is declared, and also
//                     computed: <rule>, a default made from the post's other values (menu.js)
//                     labelled: false, no label shown, which still names the field for a
//                     screen reader and in a refusal
//   field: {...}      in place of `fields`, the one field of a group of one, whose value is the
//                     group's own, under the field's name
//   heading: true     the group's label shows above its fields; otherwise it names the section
//                     for a screen reader alone
// Sveltia's own heading and menu of the field are left out (group.css), since the group's are
// the core's: Revert Changes, Restore Default and Clear, over every field it covers (menu.js).

import { say } from '../interface-language.js';
import { plain } from '../plain.js';
import { refuseAtSave } from '../refusals.js';
import { actionsOf, holding, missing } from './menu.js';
import { sourceFormat } from './source.js';
import { postValues, useGroups } from './values.js';
import { GROUP_WIDGET } from './widget.js';
import './group.css';

const ACTIONS = [['revert', 'groups.revert'], ['restore', 'groups.restore'], ['clear', 'groups.clear']];

// `groups`: the fields of each group, by the format a post's source file is read in (config.js).
export function registerGroups(CMS, config, groups = {}) {
  useGroups(Object.assign({}, ...Object.values(groups)));
  const React = globalThis.__SVELTIA_CMS_REACT__;
  const h = React.createElement;
  const defaultLocale = config.i18n?.default_locale ?? null;

  for (const [format, held] of Object.entries(groups)) CMS.registerCustomFormat(format, 'md', sourceFormat(held));

  // Escape closes an open menu alone, as Sveltia's own menus do, and not the entry, which Sveltia
  // closes on Escape from a listener on the window. This one is the window's first, since it is
  // added before Sveltia starts.
  let closeOpen = null;
  globalThis.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || closeOpen === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeOpen();
  }, { capture: true });

  // A group's menu: a button, and the actions it offers, each greyed where it would change
  // nothing, worked out as the menu opens.
  function GroupMenu({ id, label, actionsNow, act }) {
    const [open, setOpen] = React.useState(false);
    const [actions, setActions] = React.useState(null);
    const button = React.useRef(null);
    const menu = React.useRef(null);
    const items = () => [...(menu.current?.querySelectorAll('[role="menuitem"]') ?? [])];
    const close = (focus = true) => {
      setOpen(false);
      if (focus) button.current?.focus();
    };
    React.useEffect(() => {
      if (!open) return undefined;
      (items().find((item) => item.getAttribute('aria-disabled') !== 'true') ?? items()[0])?.focus();
      const away = (event) => {
        if (!menu.current?.contains(event.target) && !button.current?.contains(event.target)) close(false);
      };
      closeOpen = () => close();
      document.addEventListener('pointerdown', away, true);
      return () => {
        closeOpen = null;
        document.removeEventListener('pointerdown', away, true);
      };
    }, [open]);
    const move = (event) => {
      const all = items();
      const at = all.indexOf(document.activeElement);
      if (event.key === 'Tab') {
        close(false);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        all[(at + (event.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        all[event.key === 'Home' ? 0 : all.length - 1]?.focus();
      }
    };
    return h('div', { className: 'konzilo-group-menu' },
      h('button', {
        ref: button,
        type: 'button',
        id: `${id}-options`,
        className: 'konzilo-group-options',
        'aria-label': say('groups.options'),
        title: say('groups.options'),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? `${id}-menu` : undefined,
        onClick: () => {
          if (!open) setActions(actionsNow());
          setOpen(!open);
        },
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setActions(actionsNow());
            setOpen(true);
          }
        },
      }, h('span', { 'aria-hidden': true }, '⋮')),
      open && actions ? h('div', { ref: menu, id: `${id}-menu`, role: 'menu', className: 'konzilo-group-popup', 'aria-label': `${say('groups.menu')}: ${label}`, onKeyDown: move },
        ACTIONS.map(([action, words]) => h('button', {
          key: action,
          type: 'button',
          role: 'menuitem',
          tabIndex: -1,
          className: 'konzilo-group-action',
          'aria-disabled': !actions[action].changes,
          onClick: () => {
            if (!actions[action].changes) return;
            close();
            act(actions[action].value);
          },
        }, say(words)))) : null);
  }

  // What each group held when the form first showed it, by post, language and group, which
  // Revert Changes goes back to. It is the post's as Sveltia read it, since a field is shown
  // before it can be changed, and is forgotten when the post is saved, to be the saved one when
  // the form shows it again. A new post has none, and reverts to its first values.
  const firstSeen = new Map();
  CMS.registerEventListener({
    name: 'postSave',
    handler: ({ entry }) => {
      const post = `${entry.get('collection')}/${entry.get('slug')}/`;
      for (const key of [...firstSeen.keys()]) if (key.startsWith(post)) firstSeen.delete(key);
    },
  });

  CMS.registerFieldType(GROUP_WIDGET, React.forwardRef(function KonziloGroup(props, ref) {
    const { value, onChange, field, forID, entry } = props;
    const name = field.get('name');
    const label = plain(field.get('label')) ?? '';
    // A group of one holds its field's value as its own.
    const one = field.get('field') ?? null;
    const members = field.get('fields');
    const memberAt = (index) => one ?? members.get(index);
    const fields = one ? [plain(one)] : plain(members) ?? [];
    const asGroup = (held) => (one ? { [fields[0].name]: held } : held);
    const host = React.useRef(null);
    const [locale, setLocale] = React.useState(undefined);

    // What each field holds now. Two fields may change before Sveltia's value comes round, the
    // slug as the name is typed, so each change is made on the newest.
    const now = holding(fields, asGroup(plain(value)));
    const latest = React.useRef(now);
    latest.current = now;
    const write = (next) => {
      latest.current = next;
      onChange(one ? next[fields[0].name] : next);
    };
    const change = (member) => (next) => write({ ...latest.current, [member]: plain(next) ?? '' });

    const slug = entry?.get?.('slug') ?? '';
    const seenAs = (pane) => `${entry?.get?.('collection')}/${slug}/${pane ?? ''}/${name}`;
    React.useEffect(() => {
      const pane = host.current?.closest('[data-locale]')?.dataset.locale ?? null;
      setLocale(pane);
      if (slug && !firstSeen.has(seenAs(pane))) firstSeen.set(seenAs(pane), latest.current);
    }, [slug]);
    const read = slug ? firstSeen.get(seenAs(locale)) ?? null : null;
    const actionsNow = () => actionsOf({ fields, value: latest.current, read: read ?? (slug ? latest.current : null), data: postValues(entry?.get?.('data')) });

    // A group alike in each language is changed in the site's first language alone, and shows
    // what that holds in the others, as Sveltia's own fields do.
    const followed = plain(field.get('i18n')) === 'duplicate' && defaultLocale !== null && locale && locale !== defaultLocale;

    React.useImperativeHandle(ref, () => ({
      isValid: () => {
        const empty = followed ? [] : missing(fields, latest.current);
        return empty.length === 0 ? true : { error: { message: empty.map((each) => say('groups.required', { field: each.label })).join(' ') } };
      },
    }));

    return h('div', { ref: host, className: 'konzilo-group', 'data-group': name },
      followed ? null : h(GroupMenu, { id: forID, label, actionsNow, act: write }),
      plain(field.get('heading')) === true ? h('h3', { className: 'konzilo-group-heading' }, label) : null,
      fields.map((member, index) => {
        const id = `${forID}-${member.name}`;
        const control = CMS.getFieldType(member.widget ?? 'string')?.control;
        const shown = followed
          ? h('input', { id, className: `${props.classNameWrapper ?? ''} konzilo-part-input`, type: 'text', readOnly: true, value: String(now[member.name] ?? ''), 'aria-labelledby': `${id}-label` })
          : control ? h(control, {
            value: now[member.name],
            onChange: change(member.name),
            field: memberAt(index),
            forID: id,
            classNameWrapper: props.classNameWrapper,
            entry,
            getAsset: props.getAsset,
            addFile: props.addFile,
            pickFile: props.pickFile,
            keyPath: one ? name : `${name}.${member.name}`,
            required: member.required === true,
            readonly: false,
            invalid: false,
          }) : null;
        // A field with no label of its own keeps it, hidden, for the controls that name themselves
        // by it, which a screen reader still reads.
        const unlabelled = member.labelled === false;
        return h('div', { key: member.name, className: `konzilo-group-field${unlabelled ? ' konzilo-group-unlabelled' : ''}`, 'data-key-path': one ? name : `${name}.${member.name}`, 'data-field-type': member.widget ?? 'string' },
          unlabelled ? h('span', { id: `${id}-label`, hidden: true }, member.label) : h('div', { className: 'konzilo-group-label' },
            h('span', { id: `${id}-label` }, member.label),
            member.required === true && !followed ? h('span', { className: 'konzilo-group-required', 'aria-hidden': true }, '*') : null),
          shown,
          member.hint && !followed ? h('p', { className: 'konzilo-group-hint' }, member.hint) : null);
      }));
  }));

  // At Save, a required field left empty in a group stops the save, naming it, in every language,
  // where the group's own check did not run because the form never showed the group. It changes
  // nothing: an entry given back from here is written as Sveltia reads it back, which loses what
  // a closed bar holds.
  const collections = Object.fromEntries((config.collections ?? []).filter((one) => one.fields).map((one) => [one.name, one.fields.filter((made) => made.widget === GROUP_WIDGET)]));
  CMS.registerEventListener({
    name: 'preSave',
    handler: ({ entry }) => {
      const coreGroups = collections[entry.get('collection')] ?? [];
      const places = [['data'], ...[...(entry.get('i18n')?.keys() ?? [])].map((language) => ['i18n', language, 'data'])];
      const empty = places.flatMap((place, index) => coreGroups
        .filter((group) => index === 0 || group.i18n === true)
        .flatMap((group) => {
          const held = plain(entry.getIn([...place, group.name]));
          return group.field ? missing([group.field], { [group.field.name]: held }) : missing(group.fields, held);
        }));
      if (empty.length === 0) return;
      refuseAtSave([...new Set(empty.map((one) => say('groups.required', { field: one.label })))].join(' '));
    },
  });
}
