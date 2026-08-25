#!/usr/bin/env python3
"""Replay a Prime Agent session into an Obsidian md-log note.

Mirrors the md-log extension's formatting exactly (Obsidian callouts, quiz
Q&A with post-shuffle order, explanations), so a note reads identically
whether the extension or this script wrote it.

This is the FALLBACK for when the md-log extension is not linked (e.g. the
daemon hasn't been restarted since the extension/config changed). It is
idempotent: it fully regenerates the note from the session log, so running
it repeatedly is safe.

Usage:
  python3 mdlog_replay.py <session.jsonl> <note.md> [--title "Lesson title"]
"""
import argparse
import json
import re
from pathlib import Path

QA_TOOLS = {"quiz", "ask_user_question"}


def normalize_path(p: str) -> str:
    p = p.strip()
    if re.match(r"^[A-Za-z]:[\\/]", p):
        drive = p[0].lower()
        rest = p[2:].replace("\\", "/").lstrip("/")
        return f"/mnt/{drive}/{rest}"
    return p.replace("\\", "/")


def callout(ctype: str, title: str, body_lines: list[str]) -> str:
    lines = [f"> [!{ctype}] {title}"]
    for line in body_lines:
        lines.append(">" if line == "" else f"> {line}")
    return "\n".join(lines)


def strip_skill_blocks(text: str) -> str:
    def repl(m: re.Match) -> str:
        name = re.search(r'name="([^"]+)"', m.group(1))
        return f"> [!note] SKILL loaded: {name.group(1) if name else '(unknown)'}"
    return re.sub(r"<skill\b([^>]*)>[\s\S]*?</skill>", repl, text)


def question_callout(label: str, question: str, context, labels: list[str]) -> str:
    body = question.split("\n")
    if context:
        body.append("")
        body.extend(str(context).split("\n"))
    if labels:
        body.append("")
        body.extend(f"{i + 1}. {lab}" for i, lab in enumerate(labels))
    return callout("question", label, body)


def answer_callout(name: str, d: dict) -> str:
    status = d.get("status")
    if name == "ask_user_question":
        if status == "cancelled":
            return callout("warning", "Question — cancelled", ["(user skipped)"])
        if status == "unavailable":
            return callout("warning", "Question — unavailable", [d.get("message") or ""])
        if status == "plain_chat":
            return callout("warning", "Question — ask in plain text", [d.get("message") or ""])
        body = []
        for a in d.get("answers") or []:
            if a.get("type") == "other":
                body.append(f"Other: {a.get('label')}")
            elif a.get("type") == "text":
                body.append(a.get("label"))
            else:
                body.append(f"{a.get('index')}. {a.get('label')}")
        if not body:
            body.append("(no answer)")
        return callout("example", "Answer", body)
    # quiz
    if status == "cancelled":
        return callout("warning", "Quiz — cancelled", ["(user skipped)"])
    if status == "unavailable":
        return callout("warning", "Quiz — unavailable", [d.get("message") or ""])
    if status == "plain_chat":
        return callout("warning", "Quiz — ask in plain text", [d.get("message") or ""])
    dont_know = d.get("dontKnow") is True
    correct = d.get("correct") is True
    ctype = "question" if dont_know else ("success" if correct else "failure")
    title = "Quiz — I don't know" if dont_know else ("Quiz — correct \u2713" if correct else "Quiz — incorrect \u2717")
    body = []
    if dont_know:
        body.append("Your answer: I don't know")
    else:
        sel = ", ".join(f"{a.get('index')}. {a.get('label')}" for a in (d.get("answers") or [])) or "(none)"
        body.append(f"Your answer: {sel}")
    ci = d.get("correctIndices") or []
    body.append(f"Correct answer: {', '.join(str(i) for i in ci)}")
    if d.get("note"):
        body.append("")
        nl = str(d["note"]).split("\n")
        body.append(f"Note: {nl[0]}")
        body.extend(nl[1:])
    if d.get("explanation"):
        body.append("")
        body.extend(str(d["explanation"]).split("\n"))
    return callout(ctype, title, body)


def replay(session: Path) -> list[str]:
    entries = [json.loads(l) for l in open(session, encoding="utf-8") if l.strip()]
    results_by_id = {}
    for e in entries:
        if e.get("type") == "message" and e["message"].get("role") == "toolResult":
            m = e["message"]
            results_by_id[m.get("toolCallId")] = m

    blocks = []
    for e in entries:
        if e.get("type") != "message":
            continue
        m = e["message"]
        role = m.get("role")
        if role == "user":
            text = "".join(c.get("text", "") for c in m.get("content", []) if c.get("type") == "text")
            trimmed = strip_skill_blocks(text.strip())
            if trimmed:
                blocks.append(f"> [!quote] YOU\n\n{trimmed}")
        elif role == "assistant":
            parts = [c.get("text", "").strip() for c in m.get("content", [])
                     if c.get("type") == "text" and c.get("text", "").strip()]
            if parts:
                blocks.append(f"> [!abstract] Prime\n\n" + "\n\n".join(parts))
            for c in m.get("content", []):
                if c.get("type") != "toolCall":
                    continue
                name = c.get("name")
                if name not in QA_TOOLS:
                    continue
                args = c.get("arguments") or {}
                details = (results_by_id.get(c.get("id")) or {}).get("details") or {}
                if name == "quiz":
                    opts = details.get("options") or args.get("options") or []
                    labels = [str(o.get("label")) for o in sorted(opts, key=lambda o: o.get("index", 0))]
                    blocks.append(question_callout("Quiz", args.get("question", ""), args.get("details"), labels))
                else:
                    labels = [str(o.get("label")) for o in (args.get("options") or [])]
                    blocks.append(question_callout("Question", args.get("question", ""), args.get("details"), labels))
        elif role == "toolResult":
            if m.get("toolName") not in QA_TOOLS:
                continue
            blocks.append(answer_callout(m.get("toolName"), m.get("details") or {}))
    return blocks


def main() -> None:
    ap = argparse.ArgumentParser(description="Replay a Prime Agent session into an Obsidian md-log note.")
    ap.add_argument("session", help="path to the session .jsonl (e.g. ~/.prime/agent/sessions/<id>.jsonl)")
    ap.add_argument("note", help="path to the Obsidian note (.md); Windows paths accepted")
    ap.add_argument("--title", help="optional H1 title line for the note")
    args = ap.parse_args()

    session = Path(args.session).expanduser()
    note = Path(normalize_path(args.note)).expanduser()
    if not session.is_file():
        raise SystemExit(f"session file not found: {session}")
    blocks = replay(session)
    content = "\n\n".join(blocks)
    if args.title:
        content = f"# {args.title}\n\n" + content
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text(content + "\n", encoding="utf-8")
    print(f"Wrote {len(blocks)} blocks to {note}")


if __name__ == "__main__":
    main()
