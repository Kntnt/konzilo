// `/apple-touch-icon.png`, the integration's own route (site-icons.js): made
// from the site icon, or 404 with no body, which a build writes no file for.

import { iconResponse } from '../site-icons.js';

export const prerender = true;

export function GET() {
  return iconResponse('/apple-touch-icon.png', import.meta.env.BASE_URL);
}
