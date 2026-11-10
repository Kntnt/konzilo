// What keeps a page in the live preview's pane where it is (ADR 0032): a link, a form, a
// script or a tag in the page may try to load something else, and the editor would lose sight
// of what they are working on. Each is stopped, and the page tells the pane where it would
// have gone. It is written into the page as it stands, so it holds all it needs. It is on the
// live preview's pages alone, and does nothing in a tab of its own, which has no pane to keep.
//
// A redirect never comes here: the gate keeps the frame from following one.

// `kind`: what the pane knows these messages by. The pane is the only thing that can frame this
// page, by the gate's policy, so the message may be addressed to whoever is around it.
export function previewGuard(kind) {
  if (window.parent === window) return;

  // What a page does by itself can repeat for ever, each time with a new address, so it speaks
  // once for each address and a few times in all. What a person does, they may do again.
  const MOST_TOLD = 5;
  const told = new Set();
  const tell = (to, how) => window.parent.postMessage({ type: kind, to: String(to), how }, '*');
  const tellOnce = (to, how) => {
    const heard = `${how} ${to}`;
    if (told.has(heard) || told.size >= MOST_TOLD) return;
    told.add(heard);
    tell(to, how);
  };
  const atThisPage = (url) => url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
  const value = (attribute) => attribute?.baseVal ?? attribute;

  // A link, wherever in the page it is. One the page handles itself is the page's own business,
  // and anything that comes of it is met below; a step within this page loads nothing.
  const followed = (event) => {
    if (event.defaultPrevented || event.button === 2) return;
    const link = event.composedPath().find(({ localName }) => localName === 'a' || localName === 'area');
    const href = value(link?.href);
    if (!href) return;
    const url = new URL(href, document.baseURI);
    if (url.protocol === 'javascript:' || (atThisPage(url) && href.includes('#'))) return;
    event.preventDefault();
    const target = value(link.target);
    tell(url, target && !['_self', '_parent', '_top'].includes(target) ? 'window' : 'link');
  };
  window.addEventListener('click', followed);
  window.addEventListener('auxclick', followed);

  window.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    const action = event.submitter?.getAttribute('formaction') ?? event.target.getAttribute('action') ?? '';
    tell(new URL(action, document.baseURI), 'form');
  });

  // Everything else that would load a document in this frame: an assignment to `location`, a
  // form sent from a script, a refresh in a tag. A reload stays, since it is how the dev server
  // shows a change, and so does the page replacing itself with its own address, its path and its
  // query, which is how the page draws that change without an empty frame (preview-redraw.js); a
  // step within the document, a fragment or `pushState`, loads nothing.
  globalThis.navigation?.addEventListener('navigate', (event) => {
    if (event.destination.sameDocument || event.navigationType === 'reload' || !event.cancelable) return;
    if (event.navigationType === 'replace' && !event.formData && atThisPage(new URL(event.destination.url))) return;
    event.preventDefault();
    tellOnce(event.destination.url, event.formData ? 'form' : 'script');
  });

  // These do not come by the above. A window would only be refused by the frame's sandbox,
  // with nobody told, and a step in the history can take the editor around the frame with it.
  window.open = (to) => {
    tellOnce(new URL(to ?? '', document.baseURI), 'window');
    return null;
  };
  for (const step of ['back', 'forward', 'go']) History.prototype[step] = () => tellOnce('', 'history');
}
