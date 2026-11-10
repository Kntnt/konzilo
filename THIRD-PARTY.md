# Material of others in this repository

Konzilo's own files are under Konzilo's license ([`LICENSE`](LICENSE), with [`SITE-EXCEPTION.md`](SITE-EXCEPTION.md)). The files below hold material of others. Each is a file of its own, keeps the license it came under, and binds no other file.

| File | From | License |
|---|---|---|
| [`src/format/public-suffixes.json`](src/format/public-suffixes.json) | The rules of the Public Suffix List, `publicsuffix/list` on GitHub, at the commit the file names, in another shape | MPL-2.0, whose text is at <https://mozilla.org/MPL/2.0/> |
| [`compose/forgejo/templates/user/auth/grant.tmpl`](compose/forgejo/templates/user/auth/grant.tmpl) | Forgejo's template at the same path, changed | Forgejo's: GPL-3.0-or-later, with the parts that came from Gitea under MIT |

The packages the core installs are under their own licenses, which `package-lock.json` records and `tests/licenses.test.js` checks. So are the programs a Compose project runs beside the core, which `versions.env` names.

[`CONTRIBUTING.md`](CONTRIBUTING.md) says on which terms material of others comes in.
