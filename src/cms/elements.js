// The elements the editor's own pieces draw beside Sveltia's, each made and placed in one call.

// A `tag` element of `className`, holding `words` where given, appended to `parent` where given.
export const made = (tag, className, parent, words) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (words !== undefined) element.textContent = words;
  parent?.append(element);
  return element;
};

// A button of `className` with `words`, which does `act` when clicked, and is named `label` to a
// screen reader where its words alone say too little.
export const madeButton = (className, words, parent, act, label) => {
  const element = made('button', className, parent, words);
  element.type = 'button';
  if (label) element.setAttribute('aria-label', label);
  element.addEventListener('click', act);
  return element;
};
