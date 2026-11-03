read when an action may cost money, reach outside this repository, commit, push or publish, or when asking Thomas anything

Harnesses on this machine run without permission prompts. These gates are the only brake.

**Stop and ask Thomas first:**

- creating, renaming or publishing a GitHub repository; choosing or changing the license;
- anything that costs money: a server outside the Hetzner project `kntnt-lab`, a domain, a paid plan, GitHub Actions minutes beyond the included ones;
- DNS changes outside the test zone, `konzilo.org`;
- any server, repository or service other than this repository and `kntnt-lab`;
- deleting anything this session did not create.

**Allowed without asking:**

- work in this repository and its worktrees;
- committing, pushing branches, and merging to `main` when CI is green, or when the checks pass locally while CI is off (`docs/agents/status.md` says which);
- throwaway servers in `kntnt-lab` that the tests create and destroy;
- DNS records in the test zone.

**Never:** copy a live site's data to a machine of your own. Develop with fictional demo content.

**Credentials:** use only tokens scoped to `kntnt-lab` and the test zone. Never print a secret or commit one.

**Asking Thomas:**

- one self-contained question at a time: the context, the options, and your recommendation first;
- ask as an editor, an administrator, an operator or the client would meet the matter, never the technical detail; derive the detail from his answer;
- he answers in Swedish, and may dictate, so read names charitably. Answer him in Swedish; files stay in English.
