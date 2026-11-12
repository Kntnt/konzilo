// An email address as the service takes one, a visitor's in a form's email field and an Admin's on
// the *Mail* page alike: as a browser checks one, with a dot in its domain, as every address mail
// reaches has, and no longer than one may be (RFC 5321), so that a header may hold it as it is.
// The page's script lets an address with no dot in its domain through, as the browser does, and
// names it beside its field when the service refuses it (src/astro/forms.js).

const EMAIL_ADDRESS = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const isEmailAddress = (value) => typeof value === 'string' && value.length <= 254 && EMAIL_ADDRESS.test(value);
