# Agent tools

Added 17 October 2026 at the owner's request ("the next plugins … this is the
core of your work"). Each was read before it was committed: the skill text in
full, the rest scanned for network calls, installers and instructions that
would widen the agent's access. `skills-lock.json` pins every skill to the
hash that was reviewed; `npx skills update` changes them, so read the diff
before committing one.

| Tool | Source | Licence | What it is here |
|---|---|---|---|
| Ponytail | DietrichGebert/ponytail | MIT | Three skills: `ponytail` (the smallest change that fully solves the task), `ponytail-review` (a change) and `ponytail-audit` (the repo). Prompts only. |
| agent-skills | addyosmani/agent-skills | MIT | 25 engineering skills (spec, plan, build, test, review, ship, security, performance…). Their shared checklists are in `.claude/references/`, where the skills' `../../references/` links land. |
| graphify | Graphify-Labs/graphify | Apache-2.0 | A command-line tool, not a skill: maps the code into a graph you can query and open in a browser. |

## What was left out, and why

- **Ponytail's hooks and status band.** They only load the same prompt and
  draw a cost meter that does not show in cloud sessions. The skills are the
  whole of it.
- **agent-skills' hooks, agents and commands.** Shell hooks run on every
  session; the skills carry the method without them.
- **graphify's skill and hooks.** Its installer adds `PreToolUse` hooks that
  run `graphify` before every Bash, Grep, Read and Glob call, which fails on
  any machine without the tool (the Windows machine, a fresh cloud session).
  The skill upgrades the tool unpinned on its own and, for documents,
  requires dispatching parallel subagents: the opposite of saving tokens.
  The pinned CLI does the useful part with no model and no network.
- **OmniRoute** (diegosouzapw/OmniRoute). Not a plugin: a local gateway that
  forwards prompts and code to whichever of several hundred third-party
  providers has free quota, and advertises disguising its traffic as
  official clients. Sending this repository and its listings' data through
  it is a data-handling decision CLAUDE.md §9 does not allow by default. The
  owner may run it on their own machine, outside this repository.

## graphify

```bash
uv tool install "graphifyy[sql]==0.9.92"   # once per machine; [sql] maps the migrations
graphify update .                          # builds graphify-out/: graph.json, graph.html, GRAPH_REPORT.md
graphify query "how does a listing get published?"
graphify path "Editor" "publish_decision"
graphify explain "ListingPage"
```

Code is parsed locally with tree-sitter: no model, no key, nothing leaves the
machine. `.graphifyignore` keeps the vendored skills and build output out of
it. `graphify-out/` is in `.gitignore`: it is rewritten whole on every build
(about 8 MB) and anyone can rebuild it in seconds. On 17 Oct 2026 it held
3,756 nodes and 8,635 edges, the 51 migrations included.

## Conflicts, decided once

The precedence in `docs/DESIGN-SKILLS.md` applies to these skills too: the
owner's words, then CLAUDE.md, RESEARCH.md and PRD.md, then the design
contract, then the CI gates, then any skill.

| A skill says | Here |
|---|---|
| `/build auto`: plan once, then implement every task without stopping | CLAUDE.md §11 still holds: a plan for anything beyond one file, and the owner confirms it |
| git-workflow: branch, commit and push conventions | The session's designated branch and the repo's commit rules |
| A Stripe key in a security example | Never Stripe (CLAUDE.md §2) |
| frontend-ui-engineering's layout and visual advice | The design contract and the four design skills for anything visual; RTL rules (§4) always |
| Ponytail's "never add a dependency for a few lines" | Agrees with §2: no new dependency without asking |
| Ponytail's ultra level pushes back on the request | Allowed when the owner asks for it; the default is full |
