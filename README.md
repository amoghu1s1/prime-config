# prime-config

My config files for Prime Agent.

Port of [amosblomqvist/learn](https://github.com/amosblomqvist/learn) to Prime Agent, with my own improvements.

## How it works

The `teach` skill is built around two ideas: start from unconditional truths (things you can accept at face value, no caveats), then show how everything else derives from them so knowledge forms a connected graph instead of isolated facts.

A lesson runs in three phases:

1. **Probe** — short quizzes (`quiz.ts`) find what you already know and where it stops, and one question finds what you actually want to learn.
2. **Plan** — a researcher subagent checks the topic against primary sources (MDN, RFCs, official docs) and the agent draws a small dependency graph — roots to goal — and waits for your go-ahead.
3. **Teach** — it walks the graph node by node: motivate why this node matters, establish it, connect it to what came before, then quiz-check that it landed before moving on.

Extensions handle the interaction (`quiz` for graded questions, `ask-user-question` for open-ended choices, `md-log` for live mirroring to an Obsidian note). The `visualize` skill adds a diagram only when structure or geometry is clearer as a picture.

## Contents

- `skills/teach/`
  - `SKILL.md` — the main teaching skill: principles, probe → plan → teach loop, quiz construction rules, and LaTeX rendering
  - `subagents/researcher.md` — isolated research task: searches via DuckDuckGo HTML + `httpx`/`bs4`, fetches primary sources, returns a cited brief via `agent_message`
  - `scripts/mdlog_replay.py` — replays a session log into an Obsidian note when live logging wasn't linked; mirrors `md-log.ts` formatting
- `skills/visualize/`
  - `SKILL.md` — decides if a visual is worth it and directs a maker subagent
  - `subagents/mermaid-maker.md` — builds Mermaid diagrams
  - `subagents/svg-maker.md` — builds SVGs, renders and verifies before returning
- `extensions/`
  - `quiz.ts` — graded single/multi-select with "I don't know" and optional notes
  - `ask-user-question.ts` — preference / branching questions
  - `md-log.ts` — mirrors the whole session to `learn/<topic>.md` for Obsidian (LaTeX, Mermaid, and images render natively)

## Usage

```bash
cp -r skills/* ~/.prime/agent/skills/
cp extensions/*.ts ~/.prime/agent/extensions/
```

Optional: set your Obsidian vault for live logs (default is `C:\Users\Amogh\Desktop\Teaching` on Windows, `/mnt/c/Users/Amogh/Desktop/Teaching` under WSL).

## Credits

Original system by [Amos Blomqvist](https://github.com/amosblomqvist) — [amosblomqvist/learn](https://github.com/amosblomqvist/learn) ([How I Use AI to Learn](https://www.youtube.com/watch?v=kzcI5F4tGiU)).

The teaching philosophy, skill text, and extension designs are his. This repo is a Prime Agent port — RLM subagent wiring (`rlm`/`agent_message`), the `httpx`/`bs4` researcher implementation, `mdlog_replay.py`, and other Prime-specific fixes are my improvements.

Original repo is shared as-is with no explicit license. This port keeps his attribution intact and does not relicense his work.

## License

No license file in the original repo, so original content remains © Amos Blomqvist. My Prime Agent-specific changes in this repo are MIT — see [LICENSE](#license-file) for details. If you reuse this port, keep the Credits above.
