// A consent ID (ADR 0049), as the consent client makes one for a visitor's choices: a random UUID,
// in small letters. The service takes a record of it, and an Admin finds a visitor's records by
// it, in the service and in the editor's code in the browser alike, so it imports nothing.
export const CONSENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
