# prime-config

Public mirror of my Prime Agent configuration — skills and extensions.

Source: `~/.prime/agent/` on my dev machine.

## Contents

- `skills/teach/` — Teaching skill (2-principle dependency-graph pedagogy, Prime Agent port of [amosblomqvist/learn](https://github.com/amosblomqvist/learn))
  - `SKILL.md` — main skill (patched: strict pause contract after `await rlm(...)` to prevent infinite `print` loops)
  - `subagents/researcher.md` — researcher child role (keyless DuckDuckGo + `httpx`/`bs4`, MDN/RFC preference)
  - `scripts/mdlog_replay.py` — fallback md-log replayer for `~/.prime/agent/md-log-config.json` → Obsidian vault (`C:\Users\Amogh\Desktop\Teaching\learn\<topic>.md`)
- `skills/visualize/` — Visualization skill (`viz/` diagrams for Obsidian + terminal)
  - `subagents/mermaid-maker.md`, `subagents/svg-maker.md`
- `extensions/` — Prime Agent extensions (ported from pi)
  - `quiz.ts`, `ask-user-question.ts`, `md-log.ts` — graded quizzes, prefs, and live Obsidian mirroring

## Researcher fix (2026-08-25)

The researcher spawn pattern is `handle = await rlm(task, name="researcher")` → **plain text only** → **end turn**. Previous version allowed the parent to spam `print("a")...print("z")` via `ipython` while "waiting" — now explicitly forbidden with a guardrail note in `skills/teach/SKILL.md`.

## Usage

Clone and symlink or copy into `~/.prime/agent/`:

```bash
cp -r skills/* ~/.prime/agent/skills/
cp extensions/*.ts ~/.prime/agent/extensions/
```

Live Obsidian logging expects vault at `C:\Users\Amogh\Desktop\Teaching` (WSL: `/mnt/c/Users/Amogh/Desktop/Teaching`).

## License

MIT where applicable; skill logic inherits upstream learn repo terms.
