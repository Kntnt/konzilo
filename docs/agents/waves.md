read when building a spec's tickets through to `main`, or a run of specs one after another

A run carries on by itself from its first spec to its last, each spec through to `main` and its release after it, without Thomas (Thomas, 2026-11-11). This is the repository's own form of `implement-spec`, which only he can start, written out so that one spec leads to the next.

## A run of specs

Build the specs in the order their blockers give, each as *One spec* says, then its release, as `release.md` says, then the next. The run is done when every spec is closed, or when what is left waits on something only Thomas may do, which `docs/agents/status.md` then says.

## One spec

1. Read the spec and each of its tickets with their blockers. The tickets are a task graph; its frontier, the open tickets whose blockers are all closed, is what may be built now.
2. Make the spec's integration branch from `main`, `spec-<number>`, in a worktree under `.claude/worktrees/`, its `node_modules` cloned with `/bin/cp -cR`.
3. For each ticket on the frontier, start a fresh implementer subagent in the background, in a worktree of its own on a branch of its own off the integration branch. Brief it with pointers: the ticket, the spec, this file. Each implementer
   - confirms its worktree is at the integration branch's tip, and resets onto it if not;
   - builds the ticket test-first with the Skill tool's `mattpocock-skills:tdd`;
   - amends what its change touches: the ADRs, `content-format.md`, `docs/site-design.md`, the catalogues in both languages, the Compose guide, and `CHANGELOG.md` under `[Unreleased]` for a change a user would notice;
   - gets `npm test` green, merges the integration branch's tip into its branch, gets it green again, and reports its branch and what it settled.
4. Merge each finished branch into the integration branch with a merger subagent, which reconciles what both changed and gets `npm test` green there. Then start implementers for the tickets the merge put on the frontier.
5. Once every ticket is merged, run the Skill tool's `mattpocock-skills:code-review` on the integration branch since `main`, and fix every finding in one fresh implementer.
6. Run `npm run gate` on the integration branch's tip, until it passes: each red run is fixed by an implementer, and the gate runs again.
7. Fast-forward `main` to the integration branch and push. Where `main` has moved meanwhile, merge it into the integration branch and go back to step 6.
8. Close each ticket and the spec, each with a comment saying what was built and what the agent settled; bring `docs/agents/status.md` up to what is so; remove the worktrees and branches the spec made.

## The rules of a run

- **Containers and browsers one at a time.** One subagent at a time runs an acceptance suite or the gate, since each starts a Compose project and browsers, and the orchestrator hands out that turn. An implementer whose ticket needs an acceptance suite runs it in its turn; the others run `npm test`.
- **Settle and record.** What a ticket leaves to settle is the agent's to choose: take the course the ticket or its ADR recommends, record it in the ADR's status as a technical choice Thomas may veto, and go on.
- **What only Thomas may do waits, and the rest goes on.** An action `autonomy.md` keeps for Thomas is left undone: its ticket stays open with a comment saying what it waits on, the tickets it blocks wait with it, and the run builds everything else, releases what is done, and says what waits in the status.
- **Red twice is a bug.** A test that fails once runs again once; a second failure is fixed before anything merges.
