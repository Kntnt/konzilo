// What the site embeds for an address: { service, name, player, ratio |
// height, allow }, the service's key and name, the address of its player and
// the player's frame (a CSS aspect ratio, or a height in pixels), when the
// address has a form one of the rule data's services takes; or { reason }, by its
// name in the core's catalogues and the values that fill it (refusals.js).
//
// Each form is a regular expression whose named groups fill the `{name}`s
// of its player and its ratio.
export function embedOf(address, rules) {
  const { services, refusal } = rules.embeds;
  for (const [key, service] of Object.entries(services)) {
    for (const form of service.addresses) {
      const match = new RegExp(form.pattern).exec(address);
      if (!match) continue;
      const fill = (template) => template.replace(/\{(\w+)\}/g, (_, name) => match.groups?.[name] ?? '');
      const height = form.height ?? service.height;
      const frame = height ? { height } : { ratio: fill(form.ratio ?? service.ratio) };
      return { service: key, name: service.name, player: fill(form.player), ...frame, allow: service.allow };
    }
  }
  let host;
  try {
    host = new URL(address).hostname.toLowerCase();
  } catch {
    return { reason: { name: 'refusal.embed-address', values: { address } } };
  }
  // A service's hosts are its domains, each with every host under it.
  const known = Object.values(services).find((service) => service.hosts.some((domain) => host === domain || host.endsWith(`.${domain}`)));
  if (known) return { reason: { name: known.refusal.name, values: {} } };
  return { reason: { name: refusal.name, values: { host, services: { and: Object.values(services).map((service) => service.name) } } } };
}

