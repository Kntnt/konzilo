// A post's status, as its source file holds it in `status` and its form offers it: a draft, which
// is nobody's business but its editor's; a post scheduled to go live at its date; and a post
// published. A post that names none of them is a draft (ADR 0031, ADR 0069).

export const DRAFT = 'draft';
export const SCHEDULED = 'scheduled';
export const PUBLISHED = 'published';

export const POST_STATUSES = Object.freeze([DRAFT, SCHEDULED, PUBLISHED]);
