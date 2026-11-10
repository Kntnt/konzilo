// Where the preview's gate takes a session and a draft and says where an address leads, which
// the gate and the editor share, and what a page in the pane says when it has been kept from
// leaving. It holds nothing else, since the editor must not load what the gate imports.

export const SESSION_PATH = '/_konzilo/preview/session';
export const DRAFT_PATH = '/_konzilo/preview/draft';
export const HEALTH_PATH = '/_konzilo/preview/health';
export const WHERE_PATH = '/_konzilo/preview/where';
export const STOPPED_MESSAGE = 'konzilo-preview-stopped';
// What a page in the pane says when a block of its body is clicked, and what the pane tells the
// body field of it.
export const PLACE_MESSAGE = 'konzilo-preview-place';
export const PLACE_EVENT = 'konzilo-preview-place';
// What a field tells the preview of the block it shows, and what the pane tells the page of it:
// `path`, the block's place among the body's blocks and within them, and `text`, its text.
export const SHOW_EVENT = 'konzilo-preview-show';
export const SHOW_MESSAGE = 'konzilo-preview-show';
