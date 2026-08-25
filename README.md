# prime-config

My config files for Prime Agent.

Port of [amosblomqvist/learn](https://github.com/amosblomqvist/learn) to Prime Agent, with my own improvements.

## Contents

- `skills/teach/` — teaching skill
  - `SKILL.md`
  - `subagents/researcher.md`
  - `scripts/mdlog_replay.py`
- `skills/visualize/` — visualization skill
  - `subagents/mermaid-maker.md`
  - `subagents/svg-maker.md`
- `extensions/` — `quiz.ts`, `ask-user-question.ts`, `md-log.ts`

## Usage

```bash
cp -r skills/* ~/.prime/agent/skills/
cp extensions/*.ts ~/.prime/agent/extensions/
```
