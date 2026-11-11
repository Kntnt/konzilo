// What draws a page in the live preview again without an empty frame (ADR 0067). The dev server
// shows a change by reloading the page, and a frame being reloaded is empty for a moment. Where
// the browser has view transitions across documents, the page holds that reload, and replaces
// itself with its own address under such a transition instead, which keeps the page in view until
// the new one is drawn; it keeps where it was scrolled to, for the new page to go back to when it
// is revealed. A browser without them reloads, on the white behind the frame, and keeps the scroll
// itself. It is written into the page as it stands, so it holds all it needs. It is on the live
// preview's pages alone, and does nothing in a tab of its own, which a reload does not empty.

export function previewRedraw() {
  if (window.parent === window || !globalThis.navigation || !('CSSViewTransitionRule' in window)) return;

  const KEPT = 'konzilo-preview-scroll';
  const address = () => location.href.replace(/#.*$/, '');

  // Both the page that goes and the page that comes ask for the transition. A sheet of the
  // page's own, which no stylesheet of the site's lists.
  const asking = new CSSStyleSheet();
  asking.replaceSync('@view-transition { navigation: auto; }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, asking];

  // The page drawn again goes back to where the page it replaced was scrolled to. It may be
  // shorter when it is first drawn than when it is all there, so it goes there again until it is.
  // What was kept is read once, by the next page in the frame, which is the one that replaced it.
  // WebKit does not say how a page came in a frame of a window another window opened, such as the
  // preview's window of its own, so where the browser does not say, it is taken to be so.
  let kept = null;
  try {
    kept = JSON.parse(sessionStorage.getItem(KEPT));
    sessionStorage.removeItem(KEPT);
  } catch {
    kept = null;
  }
  if (kept?.at === address() && (navigation.activation?.navigationType ?? 'replace') === 'replace') {
    const back = () => {
      if (!kept) return;
      window.scrollTo({ left: kept.x, top: kept.y, behavior: 'instant' });
      if (window.scrollX === kept.x && window.scrollY === kept.y) kept = null;
    };
    window.addEventListener('pagereveal', back, { once: true });
    document.addEventListener('DOMContentLoaded', back, { once: true });
    window.addEventListener('load', back, { once: true });
  }

  // The dev server's reload, or the page's own. Where the scroll cannot be kept, it reloads.
  navigation.addEventListener('navigate', (event) => {
    if (event.navigationType !== 'reload' || !event.cancelable) return;
    try {
      sessionStorage.setItem(KEPT, JSON.stringify({ at: address(), x: window.scrollX, y: window.scrollY }));
    } catch {
      return;
    }
    event.preventDefault();
    location.replace(address());
  });
}
