# prime-config

My config files for [Prime](https://primeintellect.com) — skills and extensions for Prime Agent.

This repo is the Prime Agent port of [amosblomqvist/learn](https://github.com/amosblomqvist/learn) with additional improvements by me.

## Contents

- `skills/teach/` — Teaching skill (2-principle dependency-graph pedagogy)
  - `SKILL.md` — main skill
  - `subagents/researcher.md` — researcher child role (keyless DuckDuckGo + `httpx`/`bs4`, prefers MDN/RFC)
  - `scripts/mdlog_replay.py` — fallback md-log replayer for `~/.prime/agent/md-log-config.json` → Obsidian vault (`C:\Users\Amogh\Desktop\Teaching\learn\<topic>.md`)
- `skills/visualize/` — Visualization skill (`viz/` diagrams for Obsidian + terminal)
  - `subagents/mermaid-maker.md`, `subagents/svg-maker.md`
- `extensions/` — Prime Agent extensions (ported from pi)
  - `quiz.ts`, `ask-user-question.ts`, `md-log.ts` — graded quizzes, prefs, and live Obsidian mirroring

## Usage

Clone and copy into `~/.prime/agent/`:

```bash
cp -r skills/* ~/.prime/agent/skills/
cp extensions/*.ts ~/.prime/agent/extensions/
```

Live Obsidian logging expects vault at `C:\Users\Amogh\Desktop\Teaching` (WSL: `/mnt/c/Users/Amogh/Desktop/Teaching`).

## License

MIT where applicable; skill logic inherits upstream learn repo terms.
