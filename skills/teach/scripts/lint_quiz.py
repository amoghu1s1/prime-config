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

Exit code 0 = clean, 1 = findings (fix before sending),
2 = usage/parse/structure error (bad invocation or malformed JSON structure).

The input may also be a JSON ARRAY of quiz-args objects — a whole drafted round
linted in one call; findings are prefixed "quiz[i]:" per element.
"""
import json
import re
import sys

# Justification words leak the answer when they appear inside option labels.
# Temporal "since <digit>" (e.g. "rule in force since 2000") is a date, not a
# justification, so it is accepted; only a reasoned "since <word>" is flagged.
JUSTIFICATION = re.compile(
    r"\b(because|therefore|thus|due to|so that|which (?:is why|means)|as it|"
    r"given that|owing to|for this reason)\b|\bsince\s+(?!\d)", re.I)
# Hedging in ONE option makes it stand out; hedging in ALL is fine.
# "may/might/could" only count in verb-ish context ("may be", "might be",
# "could be") so calendar months and dates ("May 1968") do not false-positive.
HEDGES = re.compile(
    r"\b(usually|typically|generally|in most cases|often|likely|possibly)\b|"
    r"\b(?:may|might|could)\s+be\b", re.I)


def coerce_correct_answer(correct) -> list[str]:
    """Mirror quiz.ts coerceCorrectAnswer (:169-181): a JSON-stringified
    multi-select array (e.g. '["a", "b"]') is parsed back into a list; a
    plain value is wrapped as-is."""
    if isinstance(correct, list):
        return [str(c) for c in correct]
    s = str(correct)
    trimmed = s.strip()
    if trimmed.startswith("[") and trimmed.endswith("]"):
        try:
            parsed = json.loads(trimmed)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
        except json.JSONDecodeError:
            pass  # not valid JSON — treat as a single literal value
    return [s]


def lint(q: dict) -> list[str]:
    findings = []
    opts = q.get("options") or []
    # Trim like quiz.ts normalizeOptions (:136-137) so trims never diverge.
    labels = [str(o.get("label", "")).strip() for o in opts]
    values = [str(o.get("value") if o.get("value") is not None else o.get("label", "")).strip() for o in opts]

    if len(labels) < 2:
        findings.append("FEWER THAN 2 options — quiz needs at least two real options.")
    empty_labels = [lab for lab in labels if lab == ""]
    if empty_labels:
        # quiz.ts normalizeOptions (:140-141) filters empty labels, leaving
        # fewer than two real options and a runtime "at least two options" error.
        findings.append("EMPTY option label — quiz.ts drops empty labels before grading, "
                        "so the quiz will fail with 'at least two options'.")
    if len(set(labels)) != len(labels):
        findings.append("DUPLICATE option labels.")
    # quiz.ts normalizeOptions (:142) hard-throws on duplicate values.
    if len(set(values)) != len(values):
        dups = sorted({v for v in values if values.count(v) > 1})
        findings.append(f"DUPLICATE option values {dups!r} — quiz.ts hard-throws on these at runtime.")
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
        # Resolve like quiz.ts resolveCorrect (:193 trims, coerceCorrectAnswer
        # parses stringified arrays) so trims and stringified arrays match.
        for w in coerce_correct_answer(correct):
            w = str(w).strip()
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
    # Track (len, original-index) pairs so the message names the right options;
    # strip $...$ LaTeX before measuring (SKILL.md mandates LaTeX in options);
    # skip empty labels — quiz.ts drops those and they are flagged separately.
    pairs = [(len(re.sub(r"\$[^$]*\$", "", lab)), i) for i, lab in enumerate(labels) if lab]
    if len(pairs) >= 3:
        lo, hi = min(p[0] for p in pairs), max(p[0] for p in pairs)
        lens_sorted = sorted(p[0] for p in pairs)
        median = max(lens_sorted[len(pairs) // 2], 1)
        if hi - lo > max(0.5 * median, 10):
            longest = pairs[max(range(len(pairs)), key=lambda k: pairs[k][0])]
            shortest = pairs[min(range(len(pairs)), key=lambda k: pairs[k][0])]
            findings.append(
                f"LENGTH OUTLIER: options range {lo}-{hi} chars; longest is {labels[longest[1]]!r} "
                f"({longest[0]} chars), shortest is {labels[shortest[1]]!r} ({shortest[0]} chars) — "
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


def usage_error(msg: str) -> None:
    """Usage/parse/structure errors exit 2 so an orchestrator branching on the
    exit code never mistakes them for lint findings (exit 1) or clean (0)."""
    print(f"lint_quiz: {msg}", file=sys.stderr)
    sys.exit(2)


def main() -> None:
    if len(sys.argv) > 2:
        usage_error(f"too many arguments: {sys.argv[1:]}")
    raw = sys.argv[1] if len(sys.argv) > 1 else "-"
    if raw == "-":
        src = sys.stdin.read()
    elif re.match(r"^\s*\{", raw):
        src = raw
    else:
        try:
            with open(raw, encoding="utf-8") as f:
                src = f.read()
        except OSError as e:
            usage_error(f"cannot read input: {e}")
    try:
        q = json.loads(src)
    except json.JSONDecodeError as e:
        usage_error(f"input is not valid JSON: {e}")
    if not isinstance(q, (dict, list)):
        usage_error(f"quiz args must be a JSON object (or array of objects), got {type(q).__name__}.")
    if isinstance(q, list):
        # Batch mode: a whole drafted round in one call. Every element must be
        # a quiz-args object; any finding anywhere exits 1.
        if not q:
            usage_error("empty quiz array — nothing to lint.")
        any_findings = False
        for i, qi in enumerate(q):
            if not isinstance(qi, dict):
                usage_error(f"quiz[{i}] must be an object with label/value, got {type(qi).__name__}.")
            for o in (qi.get("options") or []):
                if not isinstance(o, dict):
                    usage_error(f"quiz[{i}].options element must be an object, got {type(o).__name__}.")
            qf = lint(qi)
            if qf:
                any_findings = True
                print(f"lint_quiz: quiz[{i}] FIX BEFORE SENDING:")
                for f in qf:
                    print(f"  - {f}")
        if any_findings:
            sys.exit(1)
        print(f"lint_quiz: CLEAN — all {len(q)} quizzes OK, send as-is.")
        return
    if not isinstance(q.get("options"), list):
        usage_error(f"'options' must be a list, got {type(q.get('options')).__name__}.")
    for i, o in enumerate(q["options"]):
        if not isinstance(o, dict):
            usage_error(f"options[{i}] must be an object with label/value, got {type(o).__name__}.")
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
