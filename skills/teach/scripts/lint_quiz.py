#!/usr/bin/env python3
"""Pre-flight linter for quiz tool arguments (teach skill).

Checks the MECHANICAL tells of a leaky quiz — the things a script can see —
so the author can fix them before the quiz reaches the learner. It does NOT
judge pedagogy; the construction procedure in the teach skill is the human
side of the check.

Usage:
  python3 lint_quiz.py '<quiz-args-json>'
  python3 lint_quiz.py quiz-args.json        # or a file path / "-" for stdin

The JSON is exactly the arguments you are about to send to `quiz`:
  {"question": ..., "options": [{"label": ..., "value": ...}, ...],
   "correctAnswer": ..., "explanation": ..., "multiSelect": ...}

Exit code 0 = clean, 1 = findings (fix before sending).
"""
import json
import re
import sys

# Justification words leak the answer when they appear inside option labels.
JUSTIFICATION = re.compile(
    r"\b(because|since|therefore|thus|due to|so that|which (?:is why|means)|as it|"
    r"given that|owing to|for this reason)\b", re.I)
# Hedging in ONE option makes it stand out; hedging in ALL is fine.
HEDGES = re.compile(r"\b(usually|typically|generally|in most cases|may|might|often)\b", re.I)


def lint(q: dict) -> list[str]:
    findings = []
    opts = q.get("options") or []
    labels = [str(o.get("label", "")) for o in opts]

    if len(labels) < 2:
        findings.append("FEWER THAN 2 options — quiz needs at least two real options.")
    if len(set(labels)) != len(labels):
        findings.append("DUPLICATE option labels.")
    if not (q.get("question") or "").strip():
        findings.append("EMPTY question text.")
    exp = (q.get("explanation") or "").strip()
    if not exp:
        findings.append("MISSING explanation — it is required and must say why the correct answer is correct.")
    elif len(exp) < 20:
        findings.append("SUSPICIOUSLY SHORT explanation (<20 chars) — it should actually explain.")

    correct = q.get("correctAnswer")
    if correct in (None, "", []):
        findings.append("MISSING correctAnswer.")
    else:
        values = [str(o.get("value") if o.get("value") is not None else o.get("label", "")) for o in opts]
        wanted = correct if isinstance(correct, list) else [correct]
        for w in wanted:
            if w not in values:
                findings.append(f"correctAnswer {w!r} MATCHES NO option value — hard error at runtime.")

    # Rule 1: bare claims — no justification inside any option label.
    for lab in labels:
        m = JUSTIFICATION.search(lab)
        if m:
            findings.append(f"JUSTIFICATION INSIDE OPTION LABEL: {m.group(0)!r} in {lab!r} — move all reasoning to the explanation field.")
    # Justification appearing ONLY in the correct answer is the worst case; it also
    # makes that option longer, so length variance below usually catches it too.

    # Length evenness: one option far longer/shorter than the rest is a shape tell.
    lens = [len(lab) for lab in labels if lab]
    if len(lens) >= 3:
        lo, hi = min(lens), max(lens)
        if hi - lo > max(15, 0.6 * max(median := sorted(lens)[len(lens)//2], 1)):
            longest = labels[lens.index(hi)]
            findings.append(
                f"LENGTH OUTLIER: options range {lo}-{hi} chars; longest is {longest!r} — "
                "regenerate the set from one skeleton (mutate the correct claim) instead of patching.")

    # Bolding asymmetry: bold in some options but not others flags the tested term.
    bolded = [len(re.findall(r"\*\*[^*]+\*\*", lab)) for lab in labels]
    if len(labels) >= 2 and any(bolded) and len(set(bolded)) > 1:
        findings.append("ASYMMETRIC BOLDING: markup appears in some options but not all — either bold the parallel term in every option, or bold nothing.")

    # Hedging asymmetry.
    hedged = [bool(HEDGES.search(lab)) for lab in labels]
    if any(hedged) and not all(hedged):
        findings.append("ASYMMETRIC HEDGING: hedge words (usually/may/typically...) appear in only some options — usually the correct one. Make all options equally hedged, or none.")

    return findings


def main() -> None:
    raw = sys.argv[1] if len(sys.argv) > 1 else "-"
    if raw == "-":
        src = sys.stdin.read()
    elif re.match(r"^\s*\{", raw):
        src = raw
    else:
        with open(raw, encoding="utf-8") as f:
            src = f.read()
    try:
        q = json.loads(src)
    except json.JSONDecodeError as e:
        sys.exit(f"lint_quiz: input is not valid JSON: {e}")
    findings = lint(q)
    if not findings:
        print("lint_quiz: CLEAN — send as-is.")
        return
    print("lint_quiz: FIX BEFORE SENDING:")
    for f in findings:
        print(f"  - {f}")
    sys.exit(1)


if __name__ == "__main__":
    main()
