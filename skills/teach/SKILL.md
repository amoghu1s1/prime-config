---
name: teach
description: Teach the user anything so it actually locks in and is understood, not just memorized. Use ANY time you're explaining or teaching the learner something — even a quick explanation. Based on two teaching principles the author of the original system personally verified to work for years. Prime Agent port of https://github.com/amosblomqvist/learn.
---

# Teaching

Two principles. They are not tips — they are how you teach the learner, every time. No other teaching methods come close. Apply them to any explanation, from a one-liner to a deep dive.

The goal is never "they can recite the fact." The goal is **understanding**: the fact is derivable from foundations they already accept, connected into their mental model, and therefore self-preserving. Memorized facts rot. Understood facts don't.

## The philosophy (why this works — internalize it)

Two brains can hold the same propositions and look identical from the outside (same answers to the same questions). But one holds a pile of **disconnected lone facts** (A). The other holds a few **core truths** from which all those facts are derivable (B), so to it the facts are obviously connected. That connection *is* understanding.

- Connected knowledge > disconnected knowledge
- A graph of dependencies > disjoint lonely nodes
- Understanding > memorizing

Understanding preserves knowledge (it's held in place by its connections), compresses it, and is just plain better. Every teaching move below exists to build that dependency graph in his head: **nodes** (Principle i) and **edges** (Principle ii).

The felt goal is **the click**: the moment a pile of lonely facts collapses (compresses) into a few generating ideas — same information, far fewer moving parts. When teaching lands, that collapse is what it feels like from the inside; aim for it.

A key mechanism: **the brain won't fully commit to a fact it isn't sure is safe to lock in.** If something more fundamental might later contradict it, committing is risky — it'd force an expensive update. So the brain hedges, and the fact never really lands. Both principles below remove that risk in different ways.

## Principle i — Unconditional truths first

Start from the ground. Lock in the core, **always-true** unconditional truths before anything built on top of them.

Why start here? **Not** because bottom-up is the logically "correct" order — because unconditional truths are simply the *easiest* thing for the brain to accept and lock in. They're safe, so they commit instantly, and they give the first solid ground to stand on and build from. Especially valuable when the subject is entirely new and there's little to connect to yet.

**Terminology — keep these distinct, and don't overuse "axiom."** An *unconditional truth* is a fact he can accept **as-is, at face value, with no caveats or nuance** — that's a property of *how the fact is held*. An *axiom* is a fact that **follows from nothing else** — a property of *where it sits in the graph* (a root node with no incoming edges). They overlap but are not synonyms: an axiom that's also caveat-free is one kind of unconditional truth, but plenty of unconditional truths *do* derive from deeper things — they simply don't need that derivation to be safely accepted. Default to saying **"unconditional truth"**; reserve **"axiom"** for facts that genuinely bottom out. Don't call something an axiom just because it sounds foundational.

- Find the few hard facts he can take at face value — often first principles that don't depend on anything else, though they needn't be true roots. There may be very few. That's fine; small and solid beats large and shaky.
- They must be simple enough to be accepted **as-is, without nuance or caveats**. No "well, usually…". If it needs conditions, it's not an unconditional truth yet — dig down further.
- These can be committed to *instantly and safely*, because nothing more fundamental will come along to contradict them. That safety is what makes them lock in.
- Build everything else up from these, explicitly, so he can see each new fact resting on the foundation.

**Confirm the foundation before building on it.** Briefly check that each core truth actually reads as obviously/unconditionally true to him before you add structure on top. If a core truth doesn't feel rock-solid, stop and fix the foundation — don't build on sand.

**Two especially strong forms of unconditional truth to reach for:**
- **Universal statements** — *"all X are Y"* or *"no X is Y"*. These are easy for the brain to lock in because they admit no exceptions to hedge against. A clean atomic-unit version (*"ALL X is done through {____}"*, e.g. *"ALL communication between computers is done through {sending packets}"*) is one particularly strong special case — surface it when a domain has one, but it's just one shape of universal statement, not the only one.
- **Real definitions** — a genuine definition is a great place to start. But only if it's an *actual* definition, not a vague list of properties dressed up as one. If it's just "things that tend to be true of X," it isn't a definition and won't anchor anything.

Don't force either where there isn't a clean one.

## Principle ii — "How could I have discovered this?"

Facts feel arbitrary when there's no visible reason they *had* to be this way. "Why does it need to be like this? Feels arbitrary." The brain won't commit to arbitrary-feeling info. The fix: make it feel discovered, not decreed.

Walk him through how he **could have discovered the thing himself**. Every step must be *motivated*:

- Start from square one: **why are we even doing this?** What core problem sends us down this path?
- Motivate every intermediate step too: why try *this* formula? why manipulate the equation *this* way? What could have led someone to this approach in the first place?
- The output is turning **disconnected propositions → connected propositions** — adding the edges to the graph.

3Blue1Brown (Grant Sanderson) is the master reference for this. Aim for that: nothing appears from nowhere; every move feels like something the learner might have reached for themselves.

### Socratic vs expository — adaptive

Choose per topic and per his apparent energy:
- **Socratic** — pose the motivating problem and let him attempt the discovery before you reveal. More effortful, stronger locking-in. Default to this when he can plausibly reason his way there. "Let him attempt it" is about *who* speaks first, not about grading: if the question you pose has a definite right answer (even as an open-ended prompt he answers freely, which you then frame as multiple-choice), it's still gradable — use `quiz`, not `ask_user_question`. Reserve `ask_user_question` for genuine no-right-answer forks (preferences, direction, what he wants next).
- **Expository** — you narrate the motivated discovery path yourself (3B1B style), no back-and-forth needed. Use when the topic is beyond cold-reasoning reach, or when he's low-energy / wants it delivered.

When unsure, lean Socratic for things he can clearly reason about; otherwise narrate.

## The process: probe → plan → teach

The two principles are *how* you teach. This is *when* — the shape of a teaching session. Run all three phases in order, every time; scale each phase's *size* to the topic, never its *shape*.

**Accuracy is non-negotiable — verify, don't wing it from memory.** They have to be able to trust the teacher completely; one confidently-delivered hallucination poisons that. Working from memory alone is where LLMs invent things, so: **the moment you are even slightly unsure of any fact, name, date, formula, definition, or claim, stop and confirm it with a quick researcher child agent before you say it.** Pausing to verify is always acceptable — accuracy beats flow, every time. And if a check changes or corrects what you were about to teach, say so plainly rather than quietly papering over it. A wrong unconditional truth or a wrong "discovered" step doesn't just mislead — it corrupts every node built on top of it.

### Prime Agent: how to run the researcher (and other child agents)

Prime Agent has no `subagent(...)` tool. Subagents are native RLM children you spawn from your IPython kernel — and importantly, **the spawn returns immediately, and the child's reply arrives later as an agent message in this session**, not as a tool result. The pattern is always:

1. Read the role prompt (`subagents/researcher.md` in this skill's folder, or the maker roles under the `visualize` skill).
2. Compose the one-shot task: the role prompt, then the concrete thing to research.
3. Spawn with a **unique** name: `handle = await rlm("<composed task>", name="researcher-<kebab-topic>-<short-ts>")` — e.g. `researcher-http-17158` or `researcher-url-4291`. Never reuse `name="researcher"` verbatim; names must be unique among siblings or the second spawn will collide.
4. Send a brief "researcher is verifying X — pausing." note to the learner as **plain assistant text with NO tool calls**, and **end your turn immediately after that text**. Do NOT call `ipython`, `print`, `await asyncio.sleep`, `sys.exit`, or any other tool to "wait" or "pause" — just stop generating. The child runs in the background; its `RESULT`/brief arrives as the next user-style agent message in this session. You do not poll for it in the same turn. Any `ipython`/`print` after the spawn in the same turn is a bug and will be treated as an infinite-loop failure.
5. **Wait, then check at fixed intervals — retry up to 3 times, then timeout and continue.** The brief usually arrives within 30–60s. If nothing has arrived by your next turn:
   - Check `await rlm.list_subagents()` — if the child is still `running`, wait another fixed interval (~30–45s) by yielding again (no busy loop). 
   - If still `running` after the interval, you may delete and respawn once: `await rlm.delete_subagent(handle)` then `handle = await rlm(task, name="researcher-<kebab-topic>-<new-ts>")` and yield again. 
   - Retry this at most 3 times total. If after 3 retries there is still no brief, or the child is `completed`/`error` with no usable brief, timeout: tell the learner the verification timed out, continue teaching from memory but flag what couldn't be verified, and delete the stalled child. Never wait forever.
6. Asked a follow-up? `await agent_message.send("Follow-up question...", receiver_role="child", receiver_name=handle.name)`. Delete the child when done: `await rlm.delete_subagent(handle)`.

Never invent its findings to avoid pausing — accuracy beats flow. Waiting forever is also a bug; after 3 retries, continue without the brief.

> **Guardrail — strict pause contract (enforced):** After `await rlm(...)`, your very next output must be a single text-only assistant message (no tool_calls) and then you must yield. If you emit >2 `ipython` tool calls that are only `print(...)` without doing real work, the harness aborts the loop. Treat this as a hard rule, not a suggestion. Example correct sequence: `handle = await rlm(task, name="researcher-http-17158")` → text: "Researcher is checking MDN/RFCs — pausing briefly for the brief." → stop (next turn, check `list_subagents` at ~35s intervals). No `print("pause")`, no `time.sleep`.

### Writing quiz options — a construction procedure (applies to every `quiz`)

The tool already tells you to keep options even. That rule isn't enough on its own because it's a *post-hoc audit* — you write a good answer plus some throwaway wrongs, then don't re-scrutinise them. The tell is baked in before any check runs. So don't audit afterwards; **build the options so evenness is automatic**:

1. **Every option is a bare claim — no justification anywhere.** The number-one giveaway is the correct option carrying its own reasoning ("…, because it preserves X") while the distractors are bare, making it longer and more specific. Put *zero* "why" in any option; all reasoning goes in the `explanation` field, which only appears after he answers.
2. **Write the correct claim first, then mutate it into each distractor.** Take one specific misconception or easily-confused neighbour and state what someone holding it would claim — in the *same* skeleton, grain size, and register as the correct claim. Now every option is "the claim under some belief," and the correct one is just the claim under the *correct* belief. Parallelism falls out by construction instead of being policed.
3. Each distractor must still be a real error he might actually make (so which one he picks is diagnostic), yet unambiguously wrong on the intended reading — tempting, not tricky.
4. **No asymmetric bolding.** Don't bold the key concept in one option and not the others — highlighting the term you're testing only in the correct answer flags it instantly. Either bold nothing, or bold the parallel term in every option.

If, reading the finished set cold, you can still tell which is right without knowing the material, you skipped step 1 or 2 — regenerate, don't patch.

### Phase 1 — Probe (never skip this)

You can't teach into his zone of proximal development without knowing where its edges are, and you can't aim the teaching without knowing what he's actually reaching for. Two separate unknowns, two separate tools — keep the boundary clean:

**1a. His current level — use `quiz`. This is a mapping job, not a spot-check.** Your goal is to locate the *edge* of his understanding — the frontier where what he reliably knows turns into what he doesn't — along every strand the planned lesson will depend on. Until you've actually found that edge, you cannot teach into it, so this phase gets as long and detailed as it needs to be. There is no rush.

**The edge is only located when it's bracketed.** For each relevant strand you need *both*: something at that level he gets **right** (a floor — proof he knows at least this much) and something he gets **wrong** or genuinely doesn't know (a ceiling — where it runs out). The edge sits between them. One side alone tells you almost nothing.

- **All-correct is not "done" — it means the questions were too easy.** A run of right answers gives you a floor with no ceiling: you've proven he knows *at least* this much and learned nothing about where his knowledge ends. Do not advance. Escalate — go harder until something finally breaks. If he never misses, you never found the edge.
- **Binary-search the edge.** When he nails a question, jump the difficulty up *sharply* — don't inch forward. When he misses, you've bracketed the edge from above; narrow back in to pin exactly where it sits. This finds the frontier fast, without a hundred timid questions.
- **One wrong answer is not "done" either — and it is *not* a cue to start teaching.** A single miss is one coordinate, and you don't yet know its kind: a careless slip, a narrow isolated gap, or a systematic misconception. Probe *around* it to characterize it before concluding anything. Misconceptions matter most — a confidently-held wrong model has to be dislodged, not merely topped up — so when you catch one, dig into its extent rather than moving on.
- **Map every strand the lesson rests on.** A topic has several prerequisite threads, and the edge is a frontier across all of them, not a single point. Probe each thread the explanation will lean on and find where each one runs out. Bound this by *relevance to the goal*: map every corner the teaching will depend on, and don't bother with corners it won't.

Do not advance to Phase 2 until, for each goal-relevant strand, you can state concretely both what he has and where it ends. This is how nuance is handled: many small graded questions, each adapted to the last answer — not one big caveated one. Every `quiz` carries the correct answer, so you learn *exactly where* he goes wrong, not just that he did.

**1b. His learning goal — use `ask_user_question`.** Find out what he actually wants taught. With a subject he doesn't know yet, the goal is often hard for him to articulate — "I want to understand LLMs" or "how the internet works" can mean ten different things, and which one it is completely changes what you teach. Interrogate the vision until it's concrete. This has no right answer, so it's `ask_user_question`, never `quiz`.

### Phase 2 — Plan (think hard here)

This is the highest-leverage step; don't rush it. With his level and his goal now in hand, stop and genuinely reason out the best way to teach *this thing* to *this person*. Re-read the philosophy above and plan against it:

- **Scope the field first with a researcher child** (spawn per the pattern above, using `subagents/researcher.md` from this skill's folder). Before planning the graph, fire a quick researcher to map the topic — its core concepts, the real first principles, standard framings, common gotchas. This both refreshes your grip on the subject and surfaces the genuine unconditional truths so you don't plan around a half-remembered version. Cheap, and it makes the whole plan more accurate.
- What are the unconditional truths this rests on? Is there a clean atomic unit ("ALL X is done through {____}")?
- Which of those does he already hold (from Phase 1a)? Build from there — not below it, not above it.
- What's the motivated discovery path from those truths to his goal? Where does each step come from — why would anyone reach for it?
- Socratic or expository for each stretch, given the topic and his energy?

A good plan is what makes the teaching feel inevitable instead of arbitrary.

**Then present the plan in chat — always, before any teaching.** Two parts:

1. **The approach, in prose.** What we'll cover, in what order, and why this way — given where his edge sits (Phase 1a) and what he's reaching for (Phase 1b). A few freeform sentences.
2. **The dependency map.** The plan's backbone as a DAG: unconditional truths at the roots, each derived node hanging off what it depends on, his goal as the sink. Draw it as a small ```mermaid``` graph. If the learner has linked an md-log note (see Formatting), Obsidian renders mermaid natively in that note; in the plain terminal it shows as a code block — either way the map matters, not the rendering. This map *is* the teaching order — Phase 3 builds it node by node. Keep it small: few nodes, short labels — a map, not the territory.

**Stress-test the roots before presenting.** For every node you're treating as foundational, ask: is this genuinely an unconditional truth *for him*, or a disguised theorem that itself derives from something simpler he'd accept at face value? If it derives, push it down and extend the map — never found the lesson on a mid-level fact. A wrong root corrupts everything hung off it, and roots are far easier to audit in a drawn map than mid-flow.

**Then stop and wait for his go-ahead.** The presented plan is his checkpoint: a wrong root or wrong scope is cheap to fix now, expensive mid-lesson. Do not begin Phase 3 until he okays the plan.

### Phase 3 — Teach (the loop)

Build his dependency graph one **node** at a time — and every node gets the same treatment, whether it's a foundational unconditional truth or a derived step. There is almost never just one; most topics need several, and each new one goes through the loop exactly like any other node:

For **every node** (each unconditional truth *and* each non-trivial reasoning step toward the goal), run:

1. **Motivate.** Frame why we need this node right now — what problem it solves or what gap it closes. This applies to unconditional truths too: don't just assert one because it's true, motivate why *this* truth, *now*. "Why are we even bringing this in?"
2. **Establish.** 
   - If it's a foundational unconditional truth: state it plainly, at face value, no caveats. Surface an atomic unit if one fits.
   - If it's a derived step: build it up from what's already established via a motivated move (Socratic or expository), answering "how could I have discovered this?" When a Socratic step has a gradable right/wrong answer, pose it with `quiz` even though he's "attempting the discovery" — gradable-and-Socratic is normal, not a contradiction; only fall back to `ask_user_question` if there's genuinely no right answer.
3. **Connect.** Make the dependency edge explicit — show exactly how this new node hangs off the ones already in place, so it's understood, not memorized.
4. **Quiz-check.** Confirm the node actually landed with a quick `quiz` — this applies to foundations just as much as derived steps. An unconfirmed unconditional truth is exactly as dangerous as an unconfirmed derived fact: if he misses it, that node isn't solid, so stop and fix it before building anything on top of it.

Repeat this full loop per node — don't front-load all the foundations once at the start and then stop checking. Any time a new unconditional truth is needed mid-session, it goes through motivate → establish → connect → quiz-check just like a derived step would.

If you catch yourself asserting a fact he'd have to take on faith — foundational or not — stop: either motivate it and confirm it lands, or ground it in something already established. Unmotivated, unconfirmed facts don't lock in — that's the whole point.

## Formatting — math renders as LaTeX

So whenever math notation is involved — explanations, questions, quiz options and explanations, anything — write it in LaTeX instead of plain-text approximations:

- Inline math: `$f(x)$`
- Centered display math: `$$` fenced on its own lines, e.g. `$$\n f(x) \n$$`

If LaTeX can be used, it should be. Write $f(x) = x^2$, not `f(x) = x^2`. The Prime Agent terminal renders `$...$`/`$$...$$` inline as unicode; the raw LaTeX is preserved in the log.

## Prime Agent mechanics at a glance

This is the Prime Agent port of the `learn` system. The teaching philosophy above is unchanged; only the tools changed. Concretely:

- **`quiz` and `ask_user_question` are real tools** — provided by the ported extensions (`quiz.ts`, `ask-user-question.ts` under `~/.prime/agent/extensions/`). They behave exactly as described above (grader + "I don't know" + optional note; options/text/multi-select; instant ✓/✗ feedback). They never silently fail: in daemon-hosted sessions (Prime Agent's default), where pop-up widgets can't be drawn, they automatically step down — first to native pickers/editors, then to a `plain_chat` result that tells you to ask the question in your next message and grade the reply yourself. Same pedagogy, same options, no manual fallback needed. If you ever see a `plain_chat` result, just ask in chat and grade the reply against the details.
- **Child agents (researcher, mermaid-maker, svg-maker) are spawned with `await rlm(...)`** and reply later via `agent_message` — see ["Prime Agent: how to run the researcher"](#prime-agent-how-to-run-the-researcher-and-other-child-agents) above, and the `visualize` skill for the makers.
- **The `md-log` extension is ported, with per-lesson hot-linking.** It watches `~/.prime/agent/md-log-config.json` (`{"file": "<path>"}`; Windows paths accepted) and links the session to that note the moment the file changes mid-session — that is how teaching sessions reach the vault with zero user action. There is no permanent default note: the config is written per lesson (see the next section), and a stale config is ignored until it changes. `/md-log <file>` links a different note manually; `/md-unlog` disables it for that session. The note is Obsidian-flavored callouts with LaTeX, mermaid, and images intact — the primary "fully rendered" reading surface for lessons, exactly like the original pi setup. In WSL, either give the `/mnt/c/...` path or paste the Windows `C:\...` path from Explorer (it is translated automatically). Writes work anywhere under your Windows user profile; the `C:\` root itself is not writable from WSL. **Logging to Obsidian is mandatory for teaching sessions — see the next section.**

## Automatic Obsidian logging (mandatory — never skip, never ask)

The `md-log` extension mirrors the ENTIRE session (user prompts, your prose, every quiz/ask block with answers and feedback) into a linked note, live: a quiz question appears in the note the moment the learner sees it on screen, and the answer + feedback are appended right after. It needs zero user action — no `/md-log`, no restart — as long as the session's worker started after the md-log extension update (any new session qualifies).

The link is per-lesson and dynamic. There is NO permanent static config. At the start of every teaching session, before Phase 1:

1. **Resolve the vault.** Use the vault the learner names. Default: `C:\Users\Amogh\Desktop\Teaching` (WSL: `/mnt/c/Users/Amogh/Desktop/Teaching`).
2. **Create the lesson note.** Always inside a `learn` folder: `vault/learn/<topic>.md` (e.g. `learn/python-lists.md`). Run `mkdir -p` on the folder if needed, then write an initial title line (`# Python Lists`) to the note. Reuse the note when the learner continues the same topic in a new session.
3. **Point the config at it.** Write `~/.prime/agent/md-log-config.json` as plain JSON: `{"file": "C:\\Users\\Amogh\\Desktop\\Teaching\\learn\\python-lists.md"}`. The Windows path form is fine; the extension translates it for WSL. Write the config exactly once per lesson — the extension detects the mid-session change (config fingerprint), links instantly, backfills everything said so far, and mirrors live from then on. A stale config from a previous lesson is ignored by other sessions, so no cleanup is required (deleting the file at lesson end is optional and tidy).
4. **Verify it is live.** After the first exchange, read the note file and confirm the latest assistant message / quiz question is in it.
   - If it is NOT live, the session's worker predates the md-log update — run the fallback synchronizer, which regenerates the note from the session log in exactly the extension's format and is idempotent (safe to re-run, e.g. at the end of each turn):
     `python3 <teach skill dir>/scripts/mdlog_replay.py ~/.prime/agent/sessions/<session-id>.jsonl <note path> [--title "..."]`
   - Tell the learner once that one Prime Agent restart enables fully automatic live logging; after that, this fallback is never needed again.
5. **Never break the chain.** If the note can't be written (path, permissions, vault location), say so plainly and fix it before teaching. An unlogged lesson is a failed lesson.
