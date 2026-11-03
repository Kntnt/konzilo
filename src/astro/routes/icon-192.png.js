// `/icon-192.png`, the integration's own route (site-icons.js): made
// from the site icon, or 404 with no body, which a build writes no file for.

import { iconResponse } from '../site-icons.js';

export const prerender = true;

export function GET() {
  return iconResponse('/icon-192.png', import.meta.env.BASE_URL);
}
