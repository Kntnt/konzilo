// The authors field: an article's authors as chips, in the order the editor gives them, which is
// the order saved and published (ADR 0062). A box suggests the authors whose names hold what is
// typed, and opens to list them all; a chip is dragged, or moved with the arrow keys, into its
// place, and removed with its own control; and a new author is added in a dialog, which commits
// the author's file at once and chooses it.
//
// Its value is the authors' IDs, the names of their files. `authors` reads and adds to them
// (terms.js), or is null where there is no repository to ask, and then the field shows the IDs.

import '../body/field.css';
import { button, dialogOf, made, textRow } from '../body/dialog.js';
import { languageTag, say } from '../body/texts.js';
import { ESCAPE_EVENT } from './widget.js';
import './field.css';

let fields = 0;

// A name as it is compared with what is typed: in small letters, without marks.
const folded = (words) => words.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();

// The authors in the order of their names, as the interface language orders them.
const byName = (authors) => [...authors].sort((one, other) => one.name.localeCompare(other.name, languageTag()) || one.id.localeCompare(other.id));

const idsIn = (given) => {
  const plain = given?.toJS ? given.toJS() : given;
  const list = Array.isArray(plain) ? plain : typeof plain === 'string' && plain !== '' ? [plain] : [];
  return [...new Set(list.filter((one) => typeof one === 'string' && one !== ''))];
};

export function mountAuthorsField(host, { value, changed, authors, label, forID = '' }) {
  fields += 1;
  const own = `konzilo-authors-${fields}`;
  let chosen = idsIn(value);
  let known = null;
  let readable = authors !== null;
  let active = -1;
  let shown = [];

  const root = made('div', 'konzilo-authors', host);
  const hint = made('span', '', root);
  hint.id = `${own}-hint`;
  hint.hidden = true;
  hint.textContent = say('authors.moveHint');
  const chips = made('ul', 'konzilo-authors-chips', root);
  chips.setAttribute('aria-label', say('authors.inOrder', { label }));

  const pick = made('div', 'konzilo-authors-pick', root);
  const box = made('div', 'konzilo-authors-box', pick);
  const input = made('input', 'konzilo-authors-input', box);
  input.type = 'text';
  if (forID) input.id = forID;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = say('authors.search');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', label);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${own}-list`);
  // The keyboard opens the list from the box itself, so the button takes the mouse alone.
  const open = button('konzilo-authors-open', '▾', box);
  open.tabIndex = -1;
  open.setAttribute('aria-label', say('authors.showAll'));
  open.title = say('authors.showAll');
  const popup = made('div', 'konzilo-authors-popup', box);
  popup.hidden = true;
  const list = made('ul', 'konzilo-authors-list', popup);
  list.id = `${own}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  const empty = made('p', 'konzilo-authors-empty', popup);
  const adding = button('konzilo-part-add konzilo-authors-new', `+ ${say('authors.new')}`, pick);
  adding.hidden = authors === null;
  const note = made('p', 'konzilo-authors-note', root);
  note.setAttribute('role', 'alert');
  // What a change did, for whoever hears the page rather than sees it.
  const spoken = made('p', 'konzilo-authors-spoken', root);
  spoken.setAttribute('role', 'status');

  const nameOf = (id) => known?.find((one) => one.id === id)?.name ?? null;
  const tell = (words) => {
    spoken.textContent = words;
  };

  const emit = (next) => {
    chosen = next;
    drawChips();
    changed([...chosen]);
    if (!popup.hidden) drawList();
  };

  // Where the keys were, once the chips are drawn again.
  const focusChip = (id, part = 'name') => {
    chips.querySelector(`[data-id="${CSS.escape(id)}"] .konzilo-authors-${part}`)?.focus();
  };

  const remove = (id, part) => {
    const at = chosen.indexOf(id);
    const name = nameOf(id) ?? id;
    emit(chosen.filter((one) => one !== id));
    const beside = chosen[at] ?? chosen[at - 1];
    if (beside) focusChip(beside, part);
    else input.focus();
    tell(say('authors.removed', { name }));
  };

  const moveTo = (id, place) => {
    const from = chosen.indexOf(id);
    const to = Math.max(0, Math.min(chosen.length - 1, place));
    if (from === to) return;
    const next = chosen.filter((one) => one !== id);
    next.splice(to, 0, id);
    emit(next);
    focusChip(id);
    tell(say('authors.moved', { name: nameOf(id) ?? id, place: to + 1, count: chosen.length }));
  };

  let dragged = null;
  const clearMark = () => {
    for (const marked of chips.querySelectorAll('[data-drop]')) delete marked.dataset.drop;
  };
  // The chip under the pointer, and which side of it; chips stand in a row that may wrap.
  const landingOf = ({ target, clientX }) => {
    const chip = target.closest?.('.konzilo-authors-chip');
    if (!chip) return null;
    const { left, width } = chip.getBoundingClientRect();
    return { chip, after: clientX >= left + width / 2 };
  };

  function drawChips() {
    chips.replaceChildren();
    chosen.forEach((id) => {
      const name = nameOf(id);
      const chip = made('li', 'konzilo-authors-chip', chips);
      chip.dataset.id = id;
      chip.draggable = true;
      if (known !== null && name === null) {
        chip.dataset.missing = '';
        chip.title = say('authors.missing', { id });
      } else chip.title = say('authors.drag');
      const shownName = made('span', 'konzilo-authors-name', chip);
      shownName.textContent = name ?? id;
      shownName.tabIndex = 0;
      shownName.setAttribute('role', 'button');
      shownName.setAttribute('aria-describedby', hint.id);
      shownName.addEventListener('keydown', (event) => {
        const at = chosen.indexOf(id);
        const moves = { ArrowLeft: at - 1, ArrowUp: at - 1, ArrowRight: at + 1, ArrowDown: at + 1, Home: 0, End: chosen.length - 1 };
        if (Object.hasOwn(moves, event.key)) {
          event.preventDefault();
          moveTo(id, moves[event.key]);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          remove(id, 'name');
        }
      });
      const removing = button('konzilo-authors-remove', '✕', chip);
      removing.setAttribute('aria-label', say('authors.remove', { name: name ?? id }));
      removing.title = say('authors.remove', { name: name ?? id });
      removing.addEventListener('click', () => remove(id, 'remove'));
      chip.addEventListener('dragstart', (event) => {
        dragged = id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-konzilo-author', id);
      });
    });
  }

  // WebKit takes no drop where this is not said on the way in, as well as on the way over.
  chips.addEventListener('dragenter', (event) => {
    if (dragged === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  chips.addEventListener('dragover', (event) => {
    if (dragged === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const landing = landingOf(event);
    if (!landing) return;
    clearMark();
    landing.chip.dataset.drop = landing.after ? 'after' : 'before';
  });
  chips.addEventListener('drop', (event) => {
    if (dragged === null) return;
    event.preventDefault();
    const marked = chips.querySelector('[data-drop]');
    const landing = landingOf(event) ?? (marked ? { chip: marked, after: marked.dataset.drop === 'after' } : null);
    const moving = dragged;
    dragged = null;
    clearMark();
    if (!landing || landing.chip.dataset.id === moving) return;
    const next = chosen.filter((one) => one !== moving);
    const at = next.indexOf(landing.chip.dataset.id);
    next.splice(landing.after ? at + 1 : at, 0, moving);
    emit(next);
  });
  chips.addEventListener('dragend', () => {
    clearMark();
    dragged = null;
  });

  // The authors not chosen yet whose names hold what is typed.
  function drawList() {
    const typed = folded(input.value.trim());
    shown = (known ?? []).filter((one) => !chosen.includes(one.id) && folded(one.name).includes(typed));
    active = shown.length === 0 ? -1 : Math.max(0, Math.min(active, shown.length - 1));
    list.replaceChildren();
    shown.forEach((one, at) => {
      const option = made('li', 'konzilo-authors-option', list);
      option.id = `${own}-option-${at}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(at === active));
      option.textContent = one.name;
      // The keys stay in the box while the mouse chooses.
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(one.id));
    });
    if (active === -1) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', `${own}-option-${active}`);
      list.children[active].scrollIntoView({ block: 'nearest' });
    }
    empty.textContent = shown.length > 0 ? '' : known === null ? say(readable ? 'authors.loading' : 'authors.unread') : known.length === 0 ? say('authors.noAuthors') : typed === '' ? say('authors.allChosen') : say('authors.none');
  }

  const openList = (at = 0) => {
    active = at;
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    drawList();
  };
  const closeList = () => {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  function choose(id) {
    input.value = '';
    closeList();
    if (!chosen.includes(id)) emit([...chosen, id]);
    input.focus();
    tell(say('authors.added', { name: nameOf(id) ?? id }));
  }

  input.addEventListener('input', () => openList(0));
  input.addEventListener('click', () => {
    if (popup.hidden) openList(0);
  });
  input.addEventListener('blur', closeList);
  input.addEventListener('keydown', (event) => {
    const step = (by) => {
      event.preventDefault();
      if (popup.hidden) {
        openList(by > 0 ? 0 : Number.MAX_SAFE_INTEGER);
        return;
      }
      if (shown.length === 0) return;
      active = (active + by + shown.length) % shown.length;
      drawList();
    };
    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      if (popup.hidden) openList(0);
    } else if (event.key === 'ArrowDown') step(1);
    else if (event.key === 'ArrowUp') step(-1);
    else if (event.key === 'Enter') {
      if (popup.hidden || active === -1) return;
      event.preventDefault();
      choose(shown[active].id);
    } else if (event.key === 'Escape' && escape()) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  // An Escape closes the list, and then empties the box, and is the field's while it does either.
  function escape() {
    if (popup.hidden && input.value === '') return false;
    if (popup.hidden) input.value = '';
    else closeList();
    return true;
  }
  input.addEventListener(ESCAPE_EVENT, escape);
  open.addEventListener('mousedown', (event) => event.preventDefault());
  open.addEventListener('click', () => {
    input.focus();
    if (popup.hidden) openList(0);
    else closeList();
  });

  adding.addEventListener('click', async () => {
    closeList();
    const added = await addAuthor({ authors, name: input.value.trim() });
    if (added === null) {
      adding.focus();
      return;
    }
    known = byName([...(known ?? []), added]);
    choose(added.id);
  });

  const ready = (authors === null ? Promise.resolve(null) : authors.list())
    .then((listed) => {
      known = byName(listed ?? []);
    })
    .catch(() => {
      readable = false;
      note.textContent = say('authors.unread');
    })
    .then(() => {
      drawChips();
      if (!popup.hidden) drawList();
    });
  drawChips();

  return {
    ready,
    setValue(next) {
      const ids = idsIn(next);
      if (ids.length === chosen.length && ids.every((id, at) => id === chosen[at])) return;
      chosen = ids;
      drawChips();
      if (!popup.hidden) drawList();
    },
    destroy() {
      root.remove();
    },
  };
}

// The dialog for a new author: a name, and a biography where one is wanted. It gives the author as
// the authors' own add() made it, or null when it was left.
function addAuthor({ authors, name, root = document.body }) {
  return new Promise((resolve) => {
    const { dialog, body } = dialogOf(say('authors.newTitle'));
    dialog.classList.add('konzilo-dialog-narrow');
    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.addEventListener('close', () => finish(null));
    // An author being added is chosen once the commit is made, so the dialog waits for it.
    dialog.addEventListener('cancel', (event) => {
      if (accept.disabled) event.preventDefault();
    });

    const form = made('form', 'konzilo-dialog-form', body);
    form.noValidate = true;
    const named = textRow(form, say('authors.name'), { required: true });
    named.value = name;
    const row = made('label', 'konzilo-dialog-row', form);
    made('span', '', row).textContent = say('authors.biography');
    const biography = made('textarea', 'konzilo-authors-biography', row);
    biography.rows = 3;
    const note = made('p', 'konzilo-dialog-note', form);
    note.setAttribute('role', 'alert');
    const actions = made('div', 'konzilo-dialog-actions', form);
    const cancel = button('', say('body.cancel'), actions);
    cancel.addEventListener('click', () => finish(null));
    const accept = made('button', 'konzilo-dialog-accept', actions);
    accept.type = 'submit';
    accept.textContent = say('authors.addNow');

    named.addEventListener('input', () => {
      note.textContent = '';
      named.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (accept.disabled) return;
      if (named.value.trim() === '') {
        note.textContent = say('authors.noName');
        named.setAttribute('aria-invalid', 'true');
        named.focus();
        return;
      }
      accept.disabled = true;
      cancel.disabled = true;
      note.textContent = '';
      try {
        finish(await authors.add({ name: named.value, biography: biography.value }));
      } catch {
        note.textContent = say('authors.notAdded');
        accept.disabled = false;
        cancel.disabled = false;
        accept.focus();
      }
    });

    root.append(dialog);
    dialog.showModal();
    named.focus();
    named.setSelectionRange(named.value.length, named.value.length);
  });
}
