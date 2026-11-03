# ADR 0010: Let agents merge when the checks pass, and keep live data off their machines

**Date:** 2026-10-28 · **Status:** Accepted, settled by Thomas: agents merge to `main` when CI is green; agents never pull a live site's data down, and only Thomas pulls a live site down; agents run system jobs on a live server after his yes, and data jobs stay the operator's.

## Decision

- **Agents do most of the work, each in its own worktree, and merge to `main` when CI is green,** or when the checks pass locally while CI is off. Everything that costs money, reaches outside this repository or makes it public waits for Thomas (`docs/agents/autonomy.md`).
- **CI must check what matters:** a piece of work is done only when an automatic test proves it.
- **Agents develop with fictional demo content.** They never copy a live site's data to a machine of their own. No agent key reaches a customer's Forgejo, and a clone of content is a data job.
- **An agent runs a system job on a live server only after Thomas has said yes in the conversation,** to that job on that site.

## Why

- Moving a site between live and local stays easy for Thomas, and customer data never lands on an agent's machine.
- Agents doing the routine work saves Thomas the most time, and a yes in the conversation keeps him in charge of each change to a live site.

## Consequences

The hosting layer's server command enforces it per SSH key, and an agent's key is refused data jobs.
