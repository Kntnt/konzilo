// What the site's reader reads, which the integration owns and the intake takes
// from it, so that the site's setting and the intake's check cannot drift apart. It
// stands alone, since the intake runs where Astro is not installed.
//
// GFM and raw HTML on, smart punctuation off, which Astro turns on unless told
// otherwise. Directives are on, for the components the rule data registers; a
// content file escapes every colon that would otherwise begin one.
export const markdownFeatures = Object.freeze({ gfm: true, rawHtml: true, smartPunctuation: false, directive: true });
