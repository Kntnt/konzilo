// The structure field: every level of a body as a tree, cards within cards, and the selected one
// as a small form. An editor need not know the structure: a click on a text in the preview opens
// its row, and the line at the top, "Page › … › Item", says where one is. The Markdown mode shows
// the file as it stands. The value is Markdown, so Sveltia saves it as it saves any field.

import { withComponents } from '../../format/components.js';
import rules from '../../format/rules.json' with { type: 'json' };
import { siteComponents } from '../body/components.js';
import { say } from '../body/texts.js';
import { PLACE_EVENT, SHOW_EVENT } from '../preview/paths.js';
import { everyNode, nodeAt, parentOf, parseBody, pathTo, summaryOf, writeBody } from './model.js';
import './field.css';

const KINDS = { heading: 'treeHeading', paragraph: 'treeParagraph', list: 'treeList', item: 'treeItem', image: 'treeImage', gallery: 'treeGallery', embed: 'treeEmbed', quote: 'treeQuote', other: 'treeOther' };
// What a block the tree adds begins with.
const NEW_BLOCKS = {
  paragraph: () => ({ kind: 'paragraph', text: say('treeNewText') }),
  heading: () => ({ kind: 'heading', level: 3, text: say('treeNewHeading') }),
  list: () => ({ kind: 'list', ordered: false, children: [{ kind: 'item', text: say('treeNewItem'), id: `new${Date.now()}` }] }),
};
// The blocks the tree adds, by the element a type takes for each.
const BLOCK_ELEMENTS = { paragraph: 'paragraph', heading: 'heading', list: 'list' };

const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  return node;
};

const counted = (kind, n) => say(kind === 'images' ? 'treeImages' : 'treeItems', { n });
const summary = (node) => summaryOf(node, counted);

// What is open and selected lives on while the same entry is opened again.
const remembered = new Map();

// `elements`: what the post's type takes. `forms`: the site's forms by name.
export function mountStructureField(host, { value: given, changed, key, forms = [], elements = [], adminHost = null, library = null }) {
  const known = withComponents(rules, siteComponents());
  const directiveRule = (name) => Object.entries(known.elements).find(([, rule]) => rule.directive?.name === name) ?? null;
  const own = siteComponents();
  const labelOf = (node) => {
    if (node.kind === 'container' || node.kind === 'leaf') {
      if (node.name === 'post-list') return say('treePostList');
      if (node.name === 'form') return say('treeForm');
      return own[node.name]?.label ?? node.name;
    }
    return say(KINDS[node.kind] ?? 'treeOther');
  };

  const frame = el('div', { class: 'konzilo-tree' });
  host.append(frame);
  const memory = remembered.get(key) ?? { open: new Set(), selected: null };
  remembered.set(key, memory);

  let value = given ?? '';
  let root;
  let mode = 'tree';
  let selected = null;
  let query = '';
  let problem = null;
  let ownValue = value;
  const open = new Set();
  let timer = null;

  const loadTree = (text) => {
    try {
      root = parseBody(text);
      problem = writeBody(root) === text.trim() ? null : say('treeRewrites');
    } catch (error) {
      root = parseBody('');
      mode = 'markdown';
      problem = say('treeUnreadable', { reason: error.message });
    }
  };

  const pathKey = (node) => pathTo(root, node)?.join('.');
  const restore = () => {
    open.clear();
    for (const path of memory.open) {
      const node = nodeAt(root, path.split('.').map(Number));
      if (node) open.add(node);
    }
    selected = memory.selected ? nodeAt(root, memory.selected.split('.').map(Number)) : null;
  };
  const remember = () => {
    memory.open = new Set([...open].map(pathKey).filter(Boolean));
    memory.selected = selected ? pathKey(selected) : null;
  };

  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    ownValue = writeBody(root);
    value = ownValue;
    changed(value);
  };
  const edited = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 120);
  };

  // To the preview: show the selected block.
  const tellPreview = (node) => {
    const path = pathTo(root, node);
    if (path) globalThis.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: { path: path.join('.'), text: summary(node) } }));
  };

  const ancestors = (node) => {
    const chain = [];
    let at = parentOf(root, node);
    while (at && at !== root) {
      chain.unshift(at);
      at = parentOf(root, at);
    }
    return chain;
  };

  let focusAfter = false;
  function select(node, { focus = true, tell = true } = {}) {
    selected = node;
    for (const up of ancestors(node)) open.add(up);
    if ((node.children ?? []).length > 0) open.add(node);
    focusAfter = focus;
    remember();
    render();
    if (tell) tellPreview(node);
  }

  const summaries = new Map();
  const refreshSummary = () => {
    for (const [node, target] of summaries) target.textContent = summary(node);
  };
  const cleanups = [];

  const textField = (labelText, read, write, { rows = 1 } = {}) => {
    const input = el('textarea', { rows });
    input.value = read();
    const grow = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight + 2}px`;
    };
    input.addEventListener('input', () => {
      write(input.value.replace(/\n\s*\n/g, '\n'));
      grow();
      refreshSummary();
      edited();
    });
    requestAnimationFrame(grow);
    return el('label', {}, labelText, input);
  };

  const attributeField = (node, name, setting, label) => {
    const current = node.attrs[name] ?? setting.default ?? '';
    const write = (next) => {
      if (next === String(setting.default ?? '') || next === '') delete node.attrs[name];
      else node.attrs[name] = next;
      refreshSummary();
      edited();
    };
    if (setting.type === 'boolean') {
      const input = el('input', { type: 'checkbox' });
      input.checked = String(current) === 'true';
      input.addEventListener('change', () => {
        if (input.checked === (setting.default === true)) delete node.attrs[name];
        else node.attrs[name] = String(input.checked);
        edited();
      });
      return el('label', { class: 'konzilo-tree-check' }, input, label);
    }
    if (setting.values) {
      const choice = el('select', {}, setting.values.map((one) => el('option', { value: String(one) }, one === '' ? say('treeNone') : String(one))));
      choice.value = String(current);
      choice.addEventListener('change', () => write(choice.value));
      return el('label', {}, label, choice);
    }
    return textField(label, () => node.attrs[name] ?? '', write);
  };

  const imageFields = (node) => {
    const picture = el('img', { alt: '' });
    if (library?.picture && /media\/.+$/.test(node.src)) {
      Promise.resolve(library.picture(node.src)).then((address) => {
        if (address) picture.src = address;
      }, () => {});
    }
    const choose = el('button', {
      type: 'button',
      onclick: async () => {
        const { chooseImage } = await import('../body/chooser.js');
        const chosen = await chooseImage({ library });
        if (!chosen) return;
        node.src = chosen.src;
        if (chosen.alt) node.alt = chosen.alt;
        edited();
        render();
      },
    }, say('treeOtherImage'));
    return [picture, library ? choose : null, textField(say('imageAlt'), () => node.alt, (next) => {
      node.alt = next;
    })];
  };

  // A paragraph is written in the body field itself, alone, which answers no click in the
  // preview of its own: the tree does.
  const bodyField = (node) => {
    const holder = el('div', { class: 'konzilo-tree-body' });
    void import('../body/field.js').then(({ mountBodyField }) => {
      if (!holder.isConnected) return;
      const mounted = mountBodyField(holder, {
        value: node.text,
        changed: (next) => {
          node.text = next;
          refreshSummary();
          edited();
        },
        elements,
        forms,
        adminHost,
        library,
        withPreview: false,
      });
      cleanups.push(() => {
        mounted.flush();
        mounted.destroy();
      });
    });
    return holder;
  };

  const formOf = (node) => {
    const fields = [];
    const note = (words) => fields.push(el('p', { class: 'konzilo-tree-note' }, words));
    switch (node.kind) {
      case 'heading':
        fields.push(textField(say('treeHeading'), () => node.text, (next) => {
          node.text = next.replace(/\n/g, ' ');
        }));
        break;
      case 'paragraph':
      case 'gallery':
      case 'embed':
        fields.push(bodyField(node));
        break;
      case 'item':
        fields.push(textField(say('treeItem'), () => node.text, (next) => {
          node.text = next.replace(/\n/g, ' ');
        }));
        break;
      case 'quote':
      case 'other':
        fields.push(textField(labelOf(node), () => node.text, (next) => {
          node.text = next;
        }, { rows: 4 }));
        break;
      case 'image':
        fields.push(...imageFields(node));
        break;
      case 'list':
        note(say('treeListNote', { n: node.children.length }));
        break;
      case 'leaf':
      case 'container': {
        const [, rule] = directiveRule(node.name) ?? [];
        const declared = rule?.directive;
        if (node.kind === 'leaf' && node.label !== null) {
          fields.push(textField(say('treeText'), () => node.label, (next) => {
            node.label = next.replace(/\n/g, ' ');
          }));
        }
        if (node.name === 'form') {
          const choice = el('select', {}, forms.map((one) => el('option', { value: one }, one)));
          choice.value = node.attrs.name;
          choice.addEventListener('change', () => {
            node.attrs.name = choice.value;
            edited();
          });
          fields.push(el('label', {}, say('treeWhichForm'), choice));
          note(say('treeFormNote'));
        } else if (node.name === 'post-list') {
          note(say('treePostListNote'));
          fields.push(textField(say('treeNumber'), () => node.attrs.number ?? '10', (next) => {
            node.attrs.number = next.trim();
          }));
        } else {
          for (const [name, setting] of Object.entries(declared?.attributes ?? {})) fields.push(attributeField(node, name, setting, own[node.name]?.attributes?.[name]?.label ?? name));
          if (fields.length === 0) note(node.kind === 'container' ? say('treeNothingHere') : say('treeNothingToSet'));
        }
        break;
      }
      default:
    }
    return el('div', { class: 'konzilo-tree-form' }, fields);
  };

  // What may be added where: a list takes items, and anything else the blocks and components the
  // type takes, but the core's own directives, which are added in the body field.
  const addChoices = (parent) => {
    if (parent.kind === 'list') return [['item', say('treeItem')]];
    const blocks = Object.entries(BLOCK_ELEMENTS).filter(([, element]) => elements.includes(element)).map(([kind]) => [kind, say(KINDS[kind])]);
    const components = Object.values(own).filter((component) => elements.includes(component.element)).map((component) => [`c:${component.name}`, component.label]);
    return [...blocks, ...components];
  };

  const add = (parent, choice) => {
    let node;
    if (choice === 'item') node = { kind: 'item', text: say('treeNewItem'), id: `new${Date.now()}` };
    else if (choice.startsWith('c:')) {
      const component = own[choice.slice(2)];
      const text = component.form === 'container' ? `:::${component.name}\n\n${say('treeNewText')}\n\n:::` : component.body === 'text' ? `::${component.name}[${say('treeNewText')}]` : `::${component.name}`;
      [node] = parseBody(text).children;
    } else node = { ...NEW_BLOCKS[choice](), id: `new${Date.now()}` };
    parent.children.push(node);
    edited();
    select(node);
  };

  const move = (node, by) => {
    const parent = parentOf(root, node);
    const at = parent.children.indexOf(node);
    const to = at + by;
    if (to < 0 || to >= parent.children.length) return;
    parent.children.splice(at, 1);
    parent.children.splice(to, 0, node);
    edited();
    select(node, { focus: false });
  };
  const remove = (node) => {
    const parent = parentOf(root, node);
    parent.children.splice(parent.children.indexOf(node), 1);
    selected = parent === root ? null : parent;
    edited();
    remember();
    render();
  };

  // What can hold something is a card, and the cards stand in one another as the bands of the
  // page do. What is only text is a row in its card. Depth gives a card its tone.
  function rowOf(node, depth = 0) {
    const box = Array.isArray(node.children);
    const hasKids = box && node.children.length > 0;
    const isOpen = open.has(node);
    const isSelected = selected === node;
    const text = el('span', { class: 'konzilo-tree-text' }, summary(node));
    summaries.set(node, text);
    const toggle = () => {
      if (isOpen) open.delete(node);
      else open.add(node);
    };
    const row = el('div', { class: 'konzilo-tree-row', 'data-selected': String(isSelected) },
      box ? el('button', { class: 'konzilo-tree-caret', type: 'button', disabled: !hasKids, 'aria-label': say(isOpen ? 'treeClose' : 'treeOpen'), 'aria-expanded': hasKids ? String(isOpen) : undefined, onclick: () => {
        toggle();
        remember();
        render();
      } }, '›') : null,
      el('button', { class: 'konzilo-tree-name', type: 'button', onclick: () => {
        if (isSelected && hasKids) toggle();
        select(node);
      } }, el('span', { class: 'konzilo-tree-type' }, labelOf(node)), text),
      el('span', { class: 'konzilo-tree-actions' },
        el('button', { type: 'button', title: say('treeUp'), 'aria-label': say('treeUp'), onclick: () => move(node, -1) }, '↑'),
        el('button', { type: 'button', title: say('treeDown'), 'aria-label': say('treeDown'), onclick: () => move(node, 1) }, '↓'),
        el('button', { type: 'button', title: say('treeRemove'), 'aria-label': say('treeRemove'), onclick: () => {
          if (globalThis.confirm(say('treeRemoveAsk', { what: labelOf(node) }))) remove(node);
        } }, '✕')));
    const item = el('li', {
      class: box ? 'konzilo-tree-box' : 'konzilo-tree-leaf',
      'data-kind': node.kind,
      'data-name': node.name,
      'data-selected': String(isSelected),
      'data-open': String(hasKids && isOpen),
      style: box ? `--depth: ${depth}` : undefined,
    }, row);
    if (isSelected) item.append(formOf(node));
    if (hasKids && isOpen) item.append(el('ul', { class: 'konzilo-tree-kids' }, node.children.map((child) => rowOf(child, depth + 1))));
    if (isSelected && box) item.append(addRow(node));
    return item;
  }

  function addRow(parent) {
    const choices = addChoices(parent);
    if (choices.length === 0) return el('div');
    const choice = el('select', { 'aria-label': say('treeAdd'), onchange: (event) => {
      if (event.target.value) add(parent, event.target.value);
    } },
    el('option', { value: '' }, say('treeAddHere')),
    choices.map(([one, words]) => el('option', { value: one }, words)));
    return el('div', { class: 'konzilo-tree-add' }, choice);
  }

  // The page's way down to what is selected.
  function crumbs() {
    if (!selected) return el('p', { class: 'konzilo-tree-crumbs' }, say('treeStart'));
    const chain = [...ancestors(selected), selected];
    const out = [el('button', { type: 'button', onclick: () => {
      selected = null;
      remember();
      render();
    } }, say('treePage'))];
    for (const node of chain) {
      out.push(' › ');
      if (node === selected) out.push(el('span', { 'aria-current': 'true' }, labelOf(node)));
      else out.push(el('button', { type: 'button', title: summary(node), onclick: () => select(node) }, labelOf(node)));
    }
    return el('nav', { class: 'konzilo-tree-crumbs', 'aria-label': say('treeWhere') }, out);
  }

  function hits() {
    if (query.trim().length < 2) return null;
    const wanted = query.trim().toLocaleLowerCase();
    const found = [];
    for (const node of everyNode(root)) {
      if ((node.children ?? []).length > 0 && node.kind !== 'list') continue;
      const text = node.kind === 'container' ? '' : summary(node);
      if (text.toLocaleLowerCase().includes(wanted)) found.push(node);
      if (found.length === 12) break;
    }
    if (found.length === 0) return el('p', { class: 'konzilo-tree-hint' }, say('treeNoHits'));
    return el('ul', { class: 'konzilo-tree-hits' }, found.map((node) => el('li', {}, el('button', { type: 'button', onclick: () => {
      query = '';
      select(node);
    } }, summary(node), el('small', {}, [...ancestors(node), node].map(labelOf).join(' › '))))));
  }

  let searchFocus = false;
  // What was written with the / menu in a text can be several blocks, or something else than
  // text. The tree gives each a row of its own when the field closes.
  const settle = (parent) => {
    for (const node of [...(parent.children ?? [])]) {
      if (!['paragraph', 'gallery', 'embed'].includes(node.kind)) {
        settle(node);
        continue;
      }
      const blocks = parseBody(node.text).children;
      if (blocks.length === 0 || (blocks.length === 1 && blocks[0].kind === node.kind)) continue;
      parent.children.splice(parent.children.indexOf(node), 1, ...blocks);
      if (selected === node) [selected] = blocks;
    }
  };

  function render() {
    for (const clean of cleanups.splice(0)) clean();
    settle(root);
    summaries.clear();
    const search = el('input', { class: 'konzilo-tree-search', type: 'search', placeholder: say('treeFind'), 'aria-label': say('treeFind'), value: query, oninput: (event) => {
      query = event.target.value;
      searchFocus = true;
      render();
    } });
    const modes = el('div', { class: 'konzilo-tree-modes', role: 'group', 'aria-label': say('treeShowAs') },
      el('button', { type: 'button', 'aria-pressed': String(mode === 'tree'), onclick: () => {
        if (mode === 'tree') return;
        loadTree(value);
        restore();
        mode = 'tree';
        render();
      } }, say('treeStructure')),
      el('button', { type: 'button', 'aria-pressed': String(mode === 'markdown'), onclick: () => {
        flush();
        remember();
        mode = 'markdown';
        render();
      } }, 'Markdown'));
    const top = el('div', { class: 'konzilo-tree-top' }, el('div', { class: 'konzilo-tree-tools' }, search, modes), mode === 'tree' ? crumbs() : null, mode === 'tree' ? hits() : null);
    const body = mode === 'tree'
      ? [el('ul', { class: 'konzilo-tree-tree' }, root.children.map((node) => rowOf(node))), el('div', {}, addRow(root))]
      : [(() => {
        const source = el('textarea', { class: 'konzilo-tree-source', spellcheck: 'false', 'aria-label': say('markdownLabel') });
        source.value = value;
        source.addEventListener('input', () => {
          value = source.value;
          ownValue = value;
          changed(value);
        });
        return source;
      })(), el('p', { class: 'konzilo-tree-hint' }, say('treeMarkdownHint'))];
    frame.replaceChildren(top, problem ? el('p', { class: 'konzilo-tree-problem' }, problem) : '', ...body);
    if (searchFocus) {
      search.focus();
      search.setSelectionRange(query.length, query.length);
      searchFocus = false;
    }
    if (focusAfter && selected) {
      focusAfter = false;
      const row = frame.querySelector('.konzilo-tree-row[data-selected="true"]');
      row?.scrollIntoView({ block: 'center' });
      row?.parentElement.querySelector('.konzilo-tree-form textarea, .konzilo-tree-form input[type="text"], .konzilo-tree-form select')?.focus();
    }
  }

  // From the preview: a click on the page, by the block's path, opens its row and brings it into
  // sight, and leaves the focus on the page, so that a key pressed there never lands in a field.
  const picked = ({ detail }) => {
    if (!frame.isConnected) return;
    // The page counts blocks by what is written, so the tree splits what a text holds first.
    for (const clean of cleanups.splice(0)) clean();
    settle(root);
    const node = nodeAt(root, String(detail.path ?? detail.block).split('.').map(Number));
    if (!node) return;
    mode = 'tree';
    select(node, { focus: false, tell: false });
    frame.querySelector('.konzilo-tree-row[data-selected="true"]')?.scrollIntoView({ block: 'center' });
  };
  globalThis.addEventListener(PLACE_EVENT, picked);

  loadTree(value);
  restore();
  render();

  return {
    frame,
    flush,
    setValue(next) {
      const text = next ?? '';
      if (text === ownValue || text === value) return;
      value = text;
      ownValue = text;
      loadTree(text);
      restore();
      if (mode === 'tree') render();
    },
    destroy() {
      flush();
      remember();
      globalThis.removeEventListener(PLACE_EVENT, picked);
      for (const clean of cleanups.splice(0)) clean();
      frame.remove();
    },
  };
}
