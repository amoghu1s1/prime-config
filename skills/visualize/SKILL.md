---
name: visualize
description: "Add a correct, minimal visual to a lesson — a diagram or geometric picture — that saves into a viz/ folder and renders in the md-log note (Obsidian) and most terminals. Use when an idea is genuinely clearer as a picture: a dependency graph, a system or flow, a sequence, a state machine, a tree, a comparison, or a spatial/geometric thing (coordinate geometry, number line, vectors, a plot, a physical layout). Outsources authoring+rendering to a maker child agent that verifies the image by looking at it (attach_image), then you embed the returned file. Prime Agent port of the learn system."
---
# Visualize

A picture earns its place only when it shows something words can't — shape, structure, direction, relationship, geometry. This skill produces ONE such picture, guarantees it is **correct** (the maker renders it and looks at it before returning), and drops it into the lesson so it renders in the md-log note / terminal.

You are the **creative director**. You decide the exact idea and distill it to its fewest carrying elements. A **maker subagent** does the authoring, rendering, visual verification, and saving, then returns a filename. You embed that filename in your reply.

## When to visualize (and when not to)

This teaching system builds a **dependency graph in the learner's head** — axioms at the root, derived facts hanging off them. A visual is powerful exactly when it makes that structure (or a geometry) visible. Reach for one when:

- The idea is a **structure or relationship**: dependencies, a system with parts and arrows, a flow/pipeline, a sequence of exchanges, a state machine, a tree/hierarchy, a comparison, a containment (what's inside vs outside).
- The idea is **spatial or geometric**: coordinate geometry, a number line, vectors, a function's shape, a physical arrangement.

Do NOT visualize when prose or a single equation already carries it. A decorative diagram that just restates the sentence next to it adds noise and a chance to be wrong. When in doubt, don't — a missing visual is cheaper than a false one.

## Choose the maker

Two maker roles live in this skill's `subagents/` folder (`subagents/mermaid-maker.md`, `subagents/svg-maker.md`). You spawn them as Prime Agent RLM children:

- **mermaid-maker** — structural/relational visuals: dependency graphs, flowcharts, sequence/state/ER/class diagrams, trees, mindmaps, timelines. This is the default and fits the dependency-graph pedagogy directly.
- **svg-maker** — spatial/geometric visuals Mermaid can't lay out: exact coordinates, geometry figures, number lines, vectors, plots, custom shapes.

Rule of thumb: if it's *nodes-and-edges / relationships*, use mermaid-maker. If it's *positions-and-shapes / geometry*, use svg-maker.

## Brief the maker well: one idea, fewest elements

The most common failure is **cramming** — every extra label makes the picture harder to read AND harder to lay out correctly. Before briefing, prune to the fewest elements that carry the idea, and for each ask: *"if I delete this, is the idea still clear?"* If yes, delete it.

Give the maker the concept AND the concrete elements you want — not a vague topic, and not a long checklist.

- BAD: "make a diagram about how TCP works"
- GOOD: "graph TD: a node 'packet' at the top; arrows down to 'ordering' and 'retransmit on loss'; both arrows down into 'reliable stream'. No title. Show that reliability is built FROM packets, not alongside them."

Keep the idea intact but trust the maker to compose; if your brief lists more than ~5–7 elements, cut it first.

## Invoke (Prime Agent: spawn an RLM child, then pause)

Prime Agent has no `subagent(...)` tool — makers are native RLM children. Read the maker's role prompt from this skill's `subagents/` folder, append your minimal brief, and spawn. The spawn **returns immediately**; the maker's reply arrives later as an agent message in this session.

**Every brief MUST name one absolute save directory — you compute it, not the maker** (the lesson's vault `viz` path, or your cwd + `/viz` if the lesson note isn't in a vault). The maker cannot know your working directory, and an unbriefed save path means the embed silently fails.

```
ts = int(time.time())
maker = await rlm(
    f"{role_prompt}\n\nBRIEF: <your minimal, concrete brief>\nSAVE TO: <absolute viz dir you computed>",
    name=f"mermaid-maker-{topic_kebab}-{ts}",   # or f"svg-maker-{topic_kebab}-{ts}"
)
```

Then end your turn with a one-line note ("making the diagram…") as **plain assistant text with NO tool calls** — no `ipython`, `print`, or any other waiting tool; the full pause contract is in the guardrail below. The maker replies later as an agent message. Do NOT hand-author or fake a diagram yourself — correctness depends on the maker's render-and-inspect loop. (Need changes after the reply? Ask via `await agent_message.send(..., receiver_role="child", receiver_name=maker.name)` or just spawn a fresh maker; delete the child when done with `await rlm.delete_subagent(maker)`.)

> **Guardrail — strict pause contract (enforced) for makers too:** After `await rlm(..., name="mermaid-maker")` or `name="svg-maker"`, your very next output must be a single text-only message and then you must yield. No `ipython`/`print` loop. Use a **unique** name per spawn (`mermaid-maker-<kebab>-<ts>`, `svg-maker-<kebab>-<ts>`) so sibling names never collide. If the maker hasn't replied after ~45s, check `await rlm.list_subagents()` at fixed intervals. One delete+respawn counts as one retry: up to 3 retries total (at most 4 spawns including the original); keep yielding one fixed interval between retries; after the third failed retry, timeout and continue without the visual. Waiting forever is a bug.

The maker renders the PNG into the exact directory the brief names, with a unique filename (`<timestamp>` = unix seconds), **looks at it with `attach_image` and iterates until it is correct and clean**, then replies:

```
RESULT:
filename: viz-<kebab-topic>-<unix-seconds>.png
path: <the absolute save dir from the brief>/viz-<kebab-topic>-<unix-seconds>.png
```

If it returns the failure form — `RESULT:` on one line, then `NONE — <one-line reason>` — it couldn't make a correct picture of the brief; simplify or rethink, or decide the visual isn't worth it. Never replace a returned file with an unverified one.

## Embed it in the lesson

Put the reference directly in your teaching reply using the returned **filename/path**. The **Obsidian wikilink embed is canonical** — it resolves by filename anywhere in the vault:

```
![[viz-<kebab-topic>-<unix-seconds>.png|500]]
```

The markdown image link is best-effort (it renders in Kitty-capable terminals). Compute it relative to the lesson note's directory — you know that path because you wrote the md-log config. E.g. `../viz/...` when the note is in `vault/learn/` and the image in `vault/viz/`:

```
![](../viz/viz-<kebab-topic>-<unix-seconds>.png)
```

That's all. The `md-log` extension mirrors your reply text verbatim into the linked `.md`, and the maker saved into the exact directory your brief named (inside the vault) — so it renders inline in the lesson automatically. Width `|500` is a good default; use larger for dense diagrams. Introduce the visual in a sentence, then let it carry the idea — don't narrate every element back in prose.

## Why this is reliable

- The maker never returns a picture it hasn't **looked at**, so "renders fine but says something false" is caught before it reaches the learner.
- PNG embed means **what the maker verified is pixel-identical to what the learner sees** — no re-render drift.
- Unique filenames keep Obsidian's by-filename embed resolution unambiguous.

> The makers render in their own shells (Mermaid via `@mermaid-js/mermaid-cli` + Chrome; SVG via `rsvg-convert` — see the role prompts). You don't render anything yourself — you only brief the maker and embed the filename it returns.
>
> **Vision-gated.** Verify-by-looking needs a vision-capable model — and the session's model changes, so never assume either way. The maker uses `attach_image`, which errors clearly when the current model can't see images. If the maker reports it cannot verify (non-vision model) or returns `RESULT: NONE`, skip or postpone the visual rather than accepting an unverified picture.
