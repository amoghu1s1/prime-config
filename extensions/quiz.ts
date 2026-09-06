/**
 * Ported from https://github.com/amosblomqvist/learn (pi) to Prime Agent.
 * Only change vs the original: import specifiers updated to Prime Agent's
 * canonical packages (@earendil-works/pi-* and typebox). Prime Agent's
 * extension loader maps these (and the old @mariozechner/* names) to its
 * bundled modules automatically.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	Text,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ────────────────────────────────────────────────────────────────────────────
// quiz — a GRADED sibling of ask_user_question.
//
// Where ask_user_question collects a preference/decision with no notion of
// right or wrong, `quiz` poses a question that HAS a correct answer, grades the
// user's selection instantly, and shows tight feedback (✓/✗ + the correct
// answer + an optional explanation) to both the user and the agent.
//
// It is intentionally options-only: single-select or multi-select. There is no
// free-text mode and no "Other" option, because a free-text answer can't be
// graded against a correct index.
// ────────────────────────────────────────────────────────────────────────────

interface QuizOption {
	label: string;
	value: string;
	description?: string;
}

interface DisplayOption extends QuizOption {
	id: string;
	index: number;
	isSubmit?: boolean;
}

interface OptionAnswer {
	label: string;
	value: string;
	index: number; // 1-based, matches the number shown to the user
}

// The always-present "I don't know" choice. It is NOT a real option: it never
// participates in shuffling, has no correct-answer value, and produces a
// distinct signal (dontKnow) rather than a right/wrong grade — so an honest
// "I don't know" is never confused with a lucky or unlucky guess.
const DONT_KNOW_VALUE = "__dont_know__";
const DONT_KNOW_LABEL = "I don't know";
const DONT_KNOW_INDEX = 0; // real options are 1-based; submit uses -1

// Unified response from either ask* component. answers holds the real
// selections (empty when dontKnow); note is the optional free-text the user
// typed in the always-present note field (kept only when non-empty).
interface QuizResponse {
	dontKnow: boolean;
	note?: string;
	answers: OptionAnswer[];
}

type QuizStatus = "answered" | "cancelled" | "unavailable" | "plain_chat";
type QuizMode = "single-select" | "multi-select";

interface DisplayedOption {
	index: number; // 1-based, in the final (possibly shuffled) display order
	label: string;
}

interface QuizResultDetails {
	status: QuizStatus;
	question: string;
	context?: string;
	mode: QuizMode;
	answers: OptionAnswer[];
	correctIndices: number[];
	options?: DisplayedOption[]; // full option list in display order, for the transcript
	correct?: boolean;
	dontKnow?: boolean; // user selected "I don't know" instead of guessing
	note?: string; // optional free-text from the always-present note field (any answer)
	explanation?: string;
	message?: string;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the answer option." }),
	value: Type.Optional(
		Type.String({ description: "Optional machine-readable value returned for the option. Defaults to the label." }),
	),
	description: Type.Optional(Type.String({ description: "Optional extra detail shown below the option." })),
});

const QuizParams = Type.Object({
	question: Type.String({
		description: "The single quiz question to ask. Ask exactly one question per tool call.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
	options: Type.Array(OptionSchema, {
		description:
			"The answer options (2 or more). Options only — there is no free-text mode. Give each option a stable `value`; you reference the correct one by that value in correctAnswer.",
		minItems: 2,
	}),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Set to true when more than one option is correct and the user must select all of them." }),
	),
	correctAnswer: Type.Union([Type.String(), Type.Array(Type.String())], {
		description:
			'REQUIRED. The correct answer as the option value(s) — the `value` field of the option you intend. Single-select: a single string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]); the user is only correct if their selection matches this set exactly. Always pass the value, not a position number — this is self-checking and prevents miscounting.',
	}),
	explanation: Type.String({
		description:
			"REQUIRED. Explanation revealed AFTER the user answers (shown whether they got it right or wrong). Use it to reinforce why the correct answer is correct.",
	}),
	shuffle: Type.Optional(
		Type.Boolean({
			description:
				"Defaults to true: options are randomly reordered before display so the correct answer isn't always in the same position. Set to false only when option order is meaningful (e.g. ordered numeric values, or an 'All/None of the above' option that must stay last).",
		}),
	),
});

function normalizeOptions(
	options: Array<{ label: string; value?: string; description?: string }> | undefined,
): QuizOption[] {
	const seen = new Set<string>();
	return (options || [])
		.map((option) => ({
			label: option.label.trim(),
			value: option.value?.trim() || option.label.trim(),
			description: option.description?.trim() || undefined,
		}))
		.filter((option) => {
			if (option.label.length === 0) return false;
			if (seen.has(option.value)) throw new Error(`duplicate option value "${option.value}"`);
			seen.add(option.value);
			return true;
		});
}

// Fisher-Yates shuffle over a copy. Safe to reorder for display because
// correctAnswer is keyed by value, not position — indices are resolved AFTER
// shuffling, so grading always matches what the user actually sees.
function shuffleOptions(options: QuizOption[]): QuizOption[] {
	const out = [...options];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// Resolve author-supplied option value(s) to 1-based indices. Keying by value
// (not position) makes the correct answer self-documenting: the author writes
// `correctAnswer: "mercury"` and a typo becomes a hard error instead of a
// silent wrong grade.
// The harness sometimes delivers a multi-select `correctAnswer` array as a
// JSON-stringified string (e.g. '["a", "b"]') instead of a real array, because
// the schema union lists String first. Detect that case and parse it back into
// an array so grading resolves against real option values. A plain single value
// is wrapped as-is.
function coerceCorrectAnswer(correctAnswer: string | string[]): string[] {
	if (Array.isArray(correctAnswer)) return correctAnswer;
	const trimmed = correctAnswer.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return parsed.map((v) => String(v));
		} catch {
			// Not valid JSON — fall through and treat as a single literal value.
		}
	}
	return [correctAnswer];
}

function resolveCorrect(
	correctAnswer: string | string[] | undefined,
	options: QuizOption[],
): { indices: number[]; error?: string } {
	if (correctAnswer === undefined) return { indices: [], error: "correctAnswer is required" };
	const arr = coerceCorrectAnswer(correctAnswer);
	if (arr.length === 0) return { indices: [], error: "correctAnswer is required" };
	const byValue = new Map(options.map((o, i) => [o.value, i + 1]));
	const indices: number[] = [];
	for (const raw of arr) {
		const v = typeof raw === "string" ? raw.trim() : raw;
		const idx = byValue.get(v);
		if (idx === undefined) {
			const known = options.map((o) => `"${o.value}"`).join(", ");
			return { indices: [], error: `correctAnswer "${v}" does not match any option value (${known})` };
		}
		indices.push(idx);
	}
	return { indices: Array.from(new Set(indices)).sort((a, b) => a - b) };
}

function createEditorTheme(theme: any): EditorTheme {
	return {
		borderColor: (s) => theme.fg("accent", s),
		selectList: {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		},
	};
}

function addWrapped(lines: string[], text: string, width: number, indent = ""): void {
	const contentWidth = Math.max(1, width - indent.length);
	for (const line of wrapTextWithAnsi(text, contentWidth)) {
		lines.push(truncateToWidth(`${indent}${line}`, width));
	}
}

function isCorrect(selectedIndices: number[], correctIndices: number[]): boolean {
	if (selectedIndices.length !== correctIndices.length) return false;
	const a = [...selectedIndices].sort((x, y) => x - y);
	const b = [...correctIndices].sort((x, y) => x - y);
	return a.every((v, i) => v === b[i]);
}

function buildStructuredResult(
	status: QuizStatus,
	question: string,
	mode: QuizMode,
	answers: OptionAnswer[],
	correctIndices: number[],
	correct: boolean | undefined,
	explanation: string | undefined,
	context?: string,
	message?: string,
	options?: DisplayedOption[],
	dontKnow?: boolean,
	note?: string,
): QuizResultDetails {
	return { status, question, context, mode, answers, correctIndices, options, correct, dontKnow, note, explanation, message };
}

function cancelledResult(question: string, mode: QuizMode, correctIndices: number[], context?: string) {
	const message =
		"The USER cancelled this quiz popup — that is their choice, not a tool failure. The quiz tool IS still available: do NOT tell the learner the quiz UI is unavailable, and do not permanently switch to plain-text quizzing because of this. Re-ask the same question later, or continue without it. Only an explicit plain_chat (or unavailable) result means the quiz tool cannot deliver in this session.";
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult("cancelled", question, mode, [], correctIndices, undefined, undefined, context, message),
	};
}

function unavailableResult(question: string, mode: QuizMode, message: string, correctIndices: number[], context?: string) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult("unavailable", question, mode, [], correctIndices, undefined, undefined, context, message),
	};
}
function plainChatResult(
	question: string,
	mode: QuizMode,
	correctIndices: number[],
	explanation: string | undefined,
	options: QuizOption[],
	context?: string,
) {
	const message =
		"Interactive quiz UI is not available in this session (the agent runs daemon/headless-hosted, where pop-up widgets cannot be drawn). " +
		"Ask the quiz question as a normal message, list the options, and wait for the user's typed reply. " +
		"After they answer, grade it yourself against details.correctIndices and details.explanation, then reply with ✓/✗, the correct answer, and the explanation. " +
		"Never reveal the correct answer before the user has answered; if they say they don't know, treat it as a knowledge gap, not a wrong guess. " +
		"Explicitly invite the user to append an optional note to their answer — anything they were unsure about or want to qualify — and factor that note into your follow-up.";
	return {
		content: [{ type: "text" as const, text: message }],
		details: buildStructuredResult(
			"plain_chat",
			question,
			mode,
			[],
			correctIndices,
			undefined,
			explanation,
			context,
			message,
			options.map((o, i) => ({ index: i + 1, label: o.label })),
		),
	};
}

// ── UI-availability adapter ─────────────────────────────────────────────────
// Interactive mode: ctx.ui.custom()/select()/editor() open a real modal and
// only settle when the user acts. Daemon/RPC-hosted sessions (the Prime Agent
// default) bridge these with stubs that settle INSTANTLY with a falsy value —
// no modal is ever drawn, which used to surface as a spurious "User cancelled".
// So we race every UI call against a short grace timer: if it settles with no
// value before the window, the host stub swallowed it and we escalate to the
// next fallback tier (native dialogs, then plain-chat) instead of cancelling.
const UI_GRACE_MS = 600;

// Set once any UI call has survived the grace window, i.e. a real dialog
// round-trip happened in this process. Used by dialogOrNoop: after this flag
// is set, the host-stub hypothesis is eliminated, so an instant valueless
// settle can only be a very fast user cancel — and is treated as one.
let realUiSeen = false;

function raceSettle<T>(promise: Promise<T>, ms: number): Promise<{ pending: true } | { pending: false; value: T }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise.then((value) => ({ pending: false as const, value })),
		new Promise<{ pending: true }>((resolve) => {
			timer = setTimeout(() => resolve({ pending: true }), ms);
		}),
	]).finally(() => {
		if (timer !== undefined) clearTimeout(timer);
	});
}

// "cancel" = an explicit user cancel (not a stub): the outcome must be
// CANCELLED, never escalated to the next fallback tier. See customOrNoop and
// dialogOrNoop for how the two are distinguished.
type HostUiOutcome<T> = { kind: "ui"; value: T | null } | { kind: "noop" } | { kind: "cancel" };

// Custom (full) UI: real in interactive mode, an instant-undefined stub in
// daemon/RPC mode.
async function customOrNoop<T>(
	ctx: any,
	factory: (tui: any, theme: any, kb: any, done: (result: T | null) => void) => unknown,
	isAnswer: (value: unknown) => boolean,
): Promise<HostUiOutcome<T>> {
	const promise = Promise.resolve(ctx.ui.custom<T | null>(factory));
	promise.catch(() => undefined);
	const settled = await raceSettle(promise, UI_GRACE_MS);
	if (settled.pending) {
		// Real interactive UI is up and waiting for the user — its result is authoritative.
		realUiSeen = true;
		return { kind: "ui", value: await promise };
	}
	// Fast settle. The API DOES expose the distinction we need: an explicit
	// user cancel settles with the payload `null` (the factory's done(null)),
	// while the daemon/RPC custom stub settles with `undefined`. So an instant
	// `null` is an explicit cancel — honour it as CANCELLED, never escalate to
	// the next tier. An instant `undefined` is the stub; only a well-formed
	// answer counts, anything else escalates.
	if (settled.value === null) {
		return { kind: "cancel" };
	}
	if (settled.value !== undefined && isAnswer(settled.value)) {
		return { kind: "ui", value: settled.value };
	}
	return { kind: "noop" };
}

// Native dialogs (select/editor/confirm): transported over the daemon when an
// extension-UI-capable client is attached; instant-falsy stub otherwise.
async function dialogOrNoop<T>(fn: () => Promise<T>): Promise<HostUiOutcome<T>> {
	const promise = Promise.resolve(fn());
	promise.catch(() => undefined);
	const settled = await raceSettle(promise, UI_GRACE_MS);
	if (settled.pending) {
		// A real dialog is up and waiting — its result is authoritative.
		realUiSeen = true;
		return { kind: "ui", value: await promise };
	}
	// Fast valueless settle. Unlike the custom tier, the dialog API exposes no
	// distinct cancel payload (a real cancel and a stub both resolve
	// `undefined`), so fall back to context: once a real dialog has survived
	// the grace window in this process, the stub hypothesis is eliminated and
	// an instant valueless settle can only be a very fast user cancel — treat
	// it as CANCELLED, never escalate. Before that, an instant settle is the
	// host stub (or a host that cannot show dialogs), and escalating to the
	// next tier is the correct reading.
	if (settled.value === undefined || settled.value === null) {
		return realUiSeen ? { kind: "cancel" } : { kind: "noop" };
	}
	realUiSeen = true;
	return { kind: "ui", value: settled.value };
}

type AdaptiveResult<T> = { kind: "answer"; value: T | null } | { kind: "chat" };


function formatOptionRef(options: QuizOption[], index: number): string {
	const opt = options.find((o, i) => i + 1 === index);
	return `${index}. ${opt ? opt.label : "(unknown)"}`;
}

function buildResult(
	question: string,
	context: string | undefined,
	mode: QuizMode,
	options: QuizOption[],
	response: QuizResponse,
	correctIndices: number[],
	explanation: string | undefined,
) {
	const { dontKnow, note, answers } = response;
	const selectedIndices = answers.map((a) => a.index);
	// "I don't know" is never counted as correct — it's a distinct outcome.
	const correct = dontKnow ? false : isCorrect(selectedIndices, correctIndices);
	const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
	const displayedOptions: DisplayedOption[] = options.map((o, i) => ({ index: i + 1, label: o.label }));

	let text: string;
	if (dontKnow) {
		// Make the signal explicit for the agent: the user did NOT guess, so this
		// is a genuine knowledge gap, not a wrong answer to correct against.
		text = `User selected "I don't know" — they did not attempt an answer (a genuine knowledge gap, not a wrong guess).`;
		text += `\nCorrect: ${correctStr}`;
		if (note) text += `\nUser's note: ${note}`;
	} else {
		const verdict = correct ? "correctly" : "incorrectly";
		const selectedStr = answers.map((a) => `${a.index}. ${a.label}`).join(", ");
		text = `User answered ${verdict}.\nSelected: ${selectedStr}\nCorrect: ${correctStr}`;
		if (note) text += `\nUser's note: ${note}`;
	}
	if (explanation) text += `\nExplanation: ${explanation}`;

	return {
		content: [{ type: "text" as const, text }],
		details: buildStructuredResult(
			"answered",
			question,
			mode,
			answers,
			correctIndices,
			correct,
			explanation,
			context,
			undefined,
			displayedOptions,
			dontKnow,
			note,
		),
	};
}

// Shared feedback block, rendered after the user submits.
function renderFeedback(
	lines: string[],
	theme: any,
	width: number,
	options: QuizOption[],
	selectedIndices: number[],
	correctIndices: number[],
	explanation: string | undefined,
	dontKnow = false,
	note?: string,
): void {
	const add = (text: string) => lines.push(truncateToWidth(text, width));
	const correct = !dontKnow && isCorrect(selectedIndices, correctIndices);
	const selectedSet = new Set(selectedIndices);
	const correctSet = new Set(correctIndices);

	lines.push("");
	for (let i = 0; i < options.length; i++) {
		const index = i + 1;
		const opt = options[i];
		const isSelected = selectedSet.has(index);
		const isKey = correctSet.has(index);
		let marker: string;
		let color: string;
		if (dontKnow) {
			// No guess was made — only reveal the correct answer(s); never show ✗.
			marker = isKey ? "✓" : " ";
			color = isKey ? "success" : "dim";
		} else if (isSelected && isKey) {
			marker = "✓";
			color = "success";
		} else if (isSelected && !isKey) {
			marker = "✗";
			color = "error";
		} else if (!isSelected && isKey) {
			// correct answer the user missed
			marker = "✓";
			color = "success";
		} else {
			marker = " ";
			color = "dim";
		}
		add(theme.fg(color, ` ${marker} ${index}. ${opt.label}`));
	}

	lines.push("");
	if (dontKnow) {
		add(theme.fg("warning", " · You said: I don't know"));
		const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	} else if (correct) {
		add(theme.fg("success", " ✓ Correct!"));
	} else {
		add(theme.fg("error", " ✗ Incorrect."));
		const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
		addWrapped(lines, theme.fg("muted", `Correct answer: ${correctStr}`), width, " ");
	}
	if (note) {
		addWrapped(lines, theme.fg("muted", `Your note: ${note}`), width, " ");
	}
	if (explanation) {
		lines.push("");
		addWrapped(lines, theme.fg("text", explanation), width, " ");
	}
	lines.push("");
	add(theme.fg("dim", " Enter/Esc to continue"));
}

// Top border + question + optional context. Shared by both components.
function pushHeader(lines: string[], theme: any, width: number, question: string, context: string | undefined): void {
	lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
	addWrapped(lines, theme.fg("text", question), width, " ");
	if (context) {
		lines.push("");
		addWrapped(lines, theme.fg("muted", context), width, " ");
	}
}

// The "I don't know" row in the selection list — visually separated and dimmed
// so it reads as distinct from the real, gradable options.
function pushDontKnowRow(lines: string[], theme: any, width: number, focused: boolean): void {
	lines.push("");
	const prefix = focused ? theme.fg("accent", "> ") : "  ";
	const styled = focused ? theme.fg("accent", DONT_KNOW_LABEL) : theme.fg("dim", DONT_KNOW_LABEL);
	lines.push(truncateToWidth(`${prefix}${styled}`, width));
}

// Persistent, always-present note field rendered under the options during the
// select phase. Applies to ANY answer (including "I don't know") and is only
// surfaced to the agent when non-empty.
function pushNoteField(lines: string[], theme: any, width: number, editor: Editor, focused: boolean): void {
	lines.push("");
	const label = focused ? theme.fg("accent", "Note (optional):") : theme.fg("muted", "Note (optional):");
	addWrapped(lines, label, width, " ");
	for (const line of editor.render(width)) lines.push(line);
}

// Build the note Editor. `disableSubmit` is set because Enter must NOT submit
// here: the editor's submit path clears the buffer, which would wipe the note.
// Instead the host intercepts Enter to return focus to the options while
// keeping the text. Ctrl+J still inserts a newline (pi convention), so
// multi-line notes work.
function makeNoteEditor(tui: any, theme: any): Editor {
	const editor = new Editor(tui, createEditorTheme(theme));
	editor.focused = false;
	editor.disableSubmit = true;
	return editor;
}

function createSingleChoiceFactory(
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
) {
	const allOptions: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const dontKnowNav = allOptions.length; // nav index of the "I don't know" row

	return (tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let phase: "select" | "feedback" = "select";
			let focus: "options" | "note" = "options";
			let chosen: OptionAnswer | null = null;
			let dontKnow = false;
			const editor = makeNoteEditor(tui, theme);
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function noteText(): string | undefined {
				const t = editor.getText().trim();
				return t.length ? t : undefined;
			}

			function toOptions() {
				focus = "options";
				editor.focused = false;
				refresh();
			}

			function response(): QuizResponse {
				const note = noteText();
				return dontKnow
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, answers: chosen ? [chosen] : [] };
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				// Tab toggles focus between the options list and the note field.
				if (matchesKey(data, Key.tab)) {
					focus = focus === "options" ? "note" : "options";
					editor.focused = focus === "note";
					refresh();
					return;
				}

				if (focus === "note") {
					// Enter and Esc both return to the options and keep the note text.
					// (Enter must be intercepted here: the editor's own submit clears
					// the buffer. Ctrl+J still reaches the editor as a newline.)
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				// focus === "options"
				if (matchesKey(data, Key.up)) {
					optionIndex = Math.max(0, optionIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					optionIndex = Math.min(dontKnowNav, optionIndex + 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					if (optionIndex === dontKnowNav) {
						dontKnow = true;
						chosen = null;
					} else {
						const selected = allOptions[optionIndex];
						chosen = { label: selected.label, value: selected.value, index: selected.index };
						dontKnow = false;
					}
					phase = "feedback";
					refresh();
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				// The cache MUST be keyed on width: pi-tui calls requestRender() but NOT
				// invalidate() on terminal resize, so render() can be re-entered with a
				// new width. Returning stale wider lines trips the TUI width guard and
				// crashes the process.
				if (cachedLines && cachedWidth === width) return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context);

				if (phase === "feedback") {
					renderFeedback(
						lines,
						theme,
						width,
						options,
						chosen ? [chosen.index] : [],
						correctIndices,
						explanation,
						dontKnow,
						noteText(),
					);
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				for (let i = 0; i < allOptions.length; i++) {
					const option = allOptions[i];
					const selected = focus === "options" && i === optionIndex;
					const prefix = selected ? theme.fg("accent", "> ") : "  ";
					const label = `${option.index}. ${option.label}`;
					const styled = selected ? theme.fg("accent", label) : theme.fg("text", label);
					add(`${prefix}${styled}`);
					if (option.description) {
						addWrapped(lines, theme.fg("muted", option.description), width, "     ");
					}
				}

				pushDontKnowRow(lines, theme, width, focus === "options" && optionIndex === dontKnowNav);

				pushNoteField(lines, theme, width, editor, focus === "note");

				lines.push("");
				if (focus === "note") {
					add(theme.fg("dim", " Type note • Ctrl+J newline • Enter back to options • Tab options • Esc back"));
				} else {
					add(theme.fg("dim", " ↑↓ navigate • Enter answer • Tab note • Esc cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));
				// Not cached when the note is focused: the editor renders a live cursor.
				if (focus !== "note") {
					cachedLines = lines;
					cachedWidth = width;
				}
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					editor.invalidate();
				},
				handleInput,
			};
		};
}

function createMultiChoiceFactory(
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
) {
	const DONT_KNOW_ID = "dont-know";
	const choiceItems: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const dontKnowItem: DisplayOption = {
		id: DONT_KNOW_ID,
		label: DONT_KNOW_LABEL,
		value: DONT_KNOW_VALUE,
		index: DONT_KNOW_INDEX,
	};
	const submitItem: DisplayOption = { id: "submit", label: "Submit", value: "__submit__", index: -1, isSubmit: true };
	const allItems: DisplayOption[] = [...choiceItems, dontKnowItem, submitItem];

	return (tui: any, theme: any, _kb: any, done: (result: QuizResponse | null) => void) => {
			let optionIndex = 0;
			let phase: "select" | "feedback" = "select";
			let focus: "options" | "note" = "options";
			const editor = makeNoteEditor(tui, theme);
			let cachedLines: string[] | undefined;
			let cachedWidth = -1;
			const selected = new Map<string, OptionAnswer>();

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function noteText(): string | undefined {
				const t = editor.getText().trim();
				return t.length ? t : undefined;
			}

			function toOptions() {
				focus = "options";
				editor.focused = false;
				refresh();
			}

			const choseDontKnow = () => selected.has(DONT_KNOW_ID);
			const realAnswers = () =>
				sortAnswers(Array.from(selected.values()).filter((a) => a.index !== DONT_KNOW_INDEX));

			function response(): QuizResponse {
				const note = noteText();
				return choseDontKnow()
					? { dontKnow: true, note, answers: [] }
					: { dontKnow: false, note, answers: realAnswers() };
			}

			// "I don't know" is exclusive: choosing it clears real selections, and
			// choosing any real option clears "I don't know".
			function toggleOption(item: DisplayOption) {
				if (item.id === DONT_KNOW_ID) {
					if (selected.has(DONT_KNOW_ID)) {
						selected.delete(DONT_KNOW_ID);
					} else {
						selected.clear();
						selected.set(DONT_KNOW_ID, { label: item.label, value: item.value, index: item.index });
					}
				} else {
					selected.delete(DONT_KNOW_ID);
					if (selected.has(item.id)) {
						selected.delete(item.id);
					} else {
						selected.set(item.id, { label: item.label, value: item.value, index: item.index });
					}
				}
				refresh();
			}

			function submit() {
				if (selected.size === 0) return;
				phase = "feedback";
				refresh();
			}

			function handleInput(data: string) {
				if (phase === "feedback") {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						done(response());
					}
					return;
				}

				// Tab toggles focus between the options list and the note field.
				if (matchesKey(data, Key.tab)) {
					focus = focus === "options" ? "note" : "options";
					editor.focused = focus === "note";
					refresh();
					return;
				}

				if (focus === "note") {
					// Enter and Esc both return to the options and keep the note text.
					// (Enter must be intercepted here: the editor's own submit clears
					// the buffer. Ctrl+J still reaches the editor as a newline.)
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
						toOptions();
						return;
					}
					editor.handleInput(data);
					tui.requestRender();
					return;
				}

				// focus === "options"
				if (matchesKey(data, Key.up)) {
					optionIndex = Math.max(0, optionIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					optionIndex = Math.min(allItems.length - 1, optionIndex + 1);
					refresh();
					return;
				}

				const current = allItems[optionIndex];
				if (matchesKey(data, Key.space)) {
					if (current.isSubmit) return;
					toggleOption(current);
					return;
				}

				if (matchesKey(data, Key.enter)) {
					if (current.isSubmit) {
						submit();
						return;
					}
					toggleOption(current);
					return;
				}

				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				// The cache MUST be keyed on width: pi-tui calls requestRender() but NOT
				// invalidate() on terminal resize, so render() can be re-entered with a
				// new width. Returning stale wider lines trips the TUI width guard and
				// crashes the process.
				if (cachedLines && cachedWidth === width) return cachedLines;

				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				pushHeader(lines, theme, width, question, context);

				if (phase === "feedback") {
					renderFeedback(
						lines,
						theme,
						width,
						options,
						realAnswers().map((a) => a.index),
						correctIndices,
						explanation,
						choseDontKnow(),
						noteText(),
					);
					add(theme.fg("accent", "─".repeat(width)));
					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				lines.push("");
				for (let i = 0; i < allItems.length; i++) {
					const item = allItems[i];
					const isFocused = focus === "options" && i === optionIndex;
					const prefix = isFocused ? theme.fg("accent", "> ") : "  ";

					if (item.isSubmit) {
						const label = selected.size > 0 ? `✓ ${item.label} (${selected.size} selected)` : `○ ${item.label}`;
						const styled = isFocused
							? theme.fg("accent", label)
							: theme.fg(selected.size > 0 ? "success" : "dim", label);
						add(`${prefix}${styled}`);
						continue;
					}

					if (item.id === DONT_KNOW_ID) {
						lines.push(""); // visual separation from the real options
						const checked = selected.has(item.id);
						const label = `${checked ? "[x]" : "[ ]"} ${item.label}`;
						const styled = isFocused ? theme.fg("accent", label) : theme.fg(checked ? "warning" : "dim", label);
						add(`${prefix}${styled}`);
						continue;
					}

					const checked = selected.has(item.id);
					const marker = checked ? "[x]" : "[ ]";
					const label = `${marker} ${item.index}. ${item.label}`;
					const styled = isFocused ? theme.fg("accent", label) : theme.fg(checked ? "success" : "text", label);
					add(`${prefix}${styled}`);
					if (item.description) {
						addWrapped(lines, theme.fg("muted", item.description), width, "     ");
					}
				}

				pushNoteField(lines, theme, width, editor, focus === "note");

				lines.push("");
				if (selected.size === 0) {
					add(theme.fg("warning", " Select at least one answer before submitting."));
				}
				if (focus === "note") {
					add(theme.fg("dim", " Type note • Ctrl+J newline • Enter back to options • Tab options • Esc back"));
				} else {
					add(theme.fg("dim", " ↑↓ navigate • Space toggle • Enter toggle/submit • Tab note • Esc cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));
				// Not cached when the note is focused: the editor renders a live cursor.
				if (focus !== "note") {
					cachedLines = lines;
					cachedWidth = width;
				}
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
					editor.invalidate();
				},
				handleInput,
			};
		};
}

function sortAnswers(answers: OptionAnswer[]): OptionAnswer[] {
	return [...answers].sort((a, b) => a.index - b.index);
}

// Reserved labels the dialog tier appends to every picker ("I don't know", and
// "Done" in multi-select). If a real option's label collides, rename its
// DISPLAY label (mirroring ask-user-question.ts's getOtherLabel pattern) so the
// real option stays selectable instead of silently mapping to the reserved
// outcome. Comparison is case-insensitive, like getOtherLabel.
function getReservedSafeLabel(label: string, reserved: string[]): string {
	const lower = label.toLowerCase();
	return reserved.some((r) => r.toLowerCase() === lower) ? `${label} (skip)` : label;
}

// A9: the note field exists in EVERY tier. The dialog tier has no inline note
// editor, so after the user answers, offer a skippable note input: an empty
// submit, an editor cancel, or a host that cannot show the editor all mean
// "no note" — the answer itself is kept either way.
async function dialogNotePrompt(ctx: any, question: string): Promise<string | undefined> {
	const typed = await dialogOrNoop<string | undefined>(() =>
		ctx.ui.editor(`Optional note — anything you were unsure about (leave empty and press Enter to skip)\n\n${question}`),
	);
	if (typed.kind !== "ui") return undefined;
	const trimmed = (typed.value ?? "").trim();
	return trimmed.length ? trimmed : undefined;
}

async function askSingleChoiceAdaptive(
	ctx: any,
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
): Promise<AdaptiveResult<QuizResponse>> {
	const viaCustom = await customOrNoop<QuizResponse | null>(ctx, createSingleChoiceFactory(question, context, options, correctIndices, explanation), (v) => typeof v === "object" && v !== null && typeof (v as { dontKnow?: unknown }).dontKnow === "boolean" && Array.isArray((v as { answers?: unknown }).answers))
	if (viaCustom.kind === "cancel") return { kind: "answer", value: null };
	if (viaCustom.kind === "ui") return { kind: "answer", value: viaCustom.value };

	// Dialog tier: native selector (+ fire-and-forget feedback toast).
	const title = context ? `${question}\n\n${context}` : question;
	// Reserved-label collision (A8): a real option labelled "I don't know" gets
	// a renamed display label so it stays selectable in this tier.
	const displayLabels = options.map((o) => getReservedSafeLabel(o.label, [DONT_KNOW_LABEL]));
	const labels = [...displayLabels, DONT_KNOW_LABEL];
	const picked = await dialogOrNoop<string | undefined>(() => ctx.ui.select(title, labels));
	if (picked.kind === "cancel") return { kind: "answer", value: null };
	if (picked.kind === "noop") return { kind: "chat" };
	if (picked.value === undefined) return { kind: "answer", value: null };
	const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
	if (picked.value === DONT_KNOW_LABEL) {
		ctx.ui.notify(`I don't know. The correct answer is: ${correctStr}`, "info");
		const note = await dialogNotePrompt(ctx, question);
		return { kind: "answer", value: { dontKnow: true, answers: [], note } };
	}
	const matchedIndex = displayLabels.indexOf(picked.value);
	const matched = matchedIndex >= 0 ? options[matchedIndex] : undefined;
	if (!matched) return { kind: "answer", value: null };
	const index = options.indexOf(matched) + 1;
	const correct = correctIndices.includes(index);
	const feedback = correct
		? `✓ Correct! ${explanation ?? ""}`.trim()
		: `✗ Incorrect. Correct: ${correctStr}. ${explanation ?? ""}`.trim();
	ctx.ui.notify(feedback, correct ? "success" : "error");
	const note = await dialogNotePrompt(ctx, question);
	return {
		kind: "answer",
		value: { dontKnow: false, answers: [{ label: matched.label, value: matched.value, index }], note },
	};
}

async function askMultiChoiceAdaptive(
	ctx: any,
	question: string,
	context: string | undefined,
	options: QuizOption[],
	correctIndices: number[],
	explanation: string | undefined,
): Promise<AdaptiveResult<QuizResponse>> {
	const viaCustom = await customOrNoop<QuizResponse | null>(ctx, createMultiChoiceFactory(question, context, options, correctIndices, explanation), (v) => typeof v === "object" && v !== null && typeof (v as { dontKnow?: unknown }).dontKnow === "boolean" && Array.isArray((v as { answers?: unknown }).answers))
	if (viaCustom.kind === "cancel") return { kind: "answer", value: null };
	if (viaCustom.kind === "ui") return { kind: "answer", value: viaCustom.value };

	// Dialog tier: repeated native selectors; picks accumulate until Done.
	const title = context ? `${question}\n\n${context}` : question;
	const DONE = "Done";
	// Reserved-label collision (A8): real options labelled "I don't know" or
	// "Done" get renamed display labels so they stay selectable in this tier.
	const reserved = [DONT_KNOW_LABEL, DONE];
	const displayLabels = new Map(options.map((o) => [o.value, getReservedSafeLabel(o.label, reserved)]));
	const answers: OptionAnswer[] = [];
	const pickedValues = new Set<string>();
	while (true) {
		const remaining = options.filter((o) => !pickedValues.has(o.value));
		const labels = [...remaining.map((o) => displayLabels.get(o.value) ?? o.label), DONT_KNOW_LABEL, DONE];
		const picked = await dialogOrNoop<string | undefined>(() =>
			ctx.ui.select(`${title} (${answers.length} selected so far — pick more, I don't know, or Done)`, labels),
		);
		if (picked.kind === "cancel") return { kind: "answer", value: null };
		if (picked.kind === "noop") return { kind: "chat" };
		if (picked.value === undefined) return { kind: "answer", value: null };
		if (picked.value === DONE) break;
		if (picked.value === DONT_KNOW_LABEL) {
			ctx.ui.notify(`I don't know. The correct answer is: ${correctIndices.map((i) => formatOptionRef(options, i)).join(", ")}`, "info");
			const note = await dialogNotePrompt(ctx, question);
			return { kind: "answer", value: { dontKnow: true, answers: [], note } };
		}
		const matched = options.find((o) => !pickedValues.has(o.value) && displayLabels.get(o.value) === picked.value);
		if (!matched) continue;
		pickedValues.add(matched.value);
		answers.push({ label: matched.label, value: matched.value, index: options.indexOf(matched) + 1 });
	}
	const correct = isCorrect(answers.map((a) => a.index), correctIndices);
	const correctStr = correctIndices.map((i) => formatOptionRef(options, i)).join(", ");
	const feedback = correct
		? `✓ Correct! ${explanation ?? ""}`.trim()
		: `✗ Incorrect. Correct: ${correctStr}. ${explanation ?? ""}`.trim();
	ctx.ui.notify(feedback, correct ? "success" : "error");
	const note = await dialogNotePrompt(ctx, question);
	return { kind: "answer", value: { dontKnow: false, answers, note } };
}

// Shared UI mutex. ctx.ui.custom()/editor can only handle one active call at
// a time, so ALL pop-up-style tools (quiz, ask_user_question, ...) must
// serialize against each other, not just against themselves. We stash one
// mutex on globalThis so separate extension files can share it without
// importing each other.
const SHARED_UI_LOCK_KEY = "__piSharedUiLock";
function getSharedUiLock() {
	const g = globalThis as any;
	if (!g[SHARED_UI_LOCK_KEY]) {
		let chain: Promise<void> = Promise.resolve();
		g[SHARED_UI_LOCK_KEY] = {
			withLock<T>(fn: () => T | Promise<T>): Promise<T> {
				const prev = chain;
				let release: () => void;
				chain = new Promise<void>((r) => { release = r; });
				return prev.then(fn).finally(() => release!());
			},
		};
	}
	return g[SHARED_UI_LOCK_KEY] as { withLock<T>(fn: () => T | Promise<T>): Promise<T> };
}
const sharedUiLock = getSharedUiLock();

function withUILock<T>(fn: () => Promise<T>): Promise<T> {
	return sharedUiLock.withLock(fn);
}

export default function quiz(pi: ExtensionAPI) {
	pi.registerTool({
		name: "quiz",
		label: "quiz",
		description:
			"Ask the user a GRADED question with a known correct answer, then instantly grade and give feedback. Unlike ask_user_question (which collects preferences/decisions with no right answer), quiz always has a correct answer supplied by you, marks the user's selection right/wrong (✓/✗), reveals the correct answer, and can show an explanation. Use it to (1) assess what the learner already understands before teaching, and (2) run tight practice/retrieval loops after explaining, or probe understanding whenever you're unsure they've got it. Options-only: single-select or multi-select, plus an automatic 'I don't know' choice so the user can signal a genuine gap instead of guessing. An optional free-text note is available in EVERY tier — Tab to focus it in the interactive UI, a skippable prompt after answering in the dialog tier, or appended to the typed answer in the plain-chat fallback — and lets the user attach context to ANY answer; it reaches you only when non-empty. No free-text answers — for non-graded questions use ask_user_question instead.",
		promptSnippet:
			"Use the quiz tool to test the user with a graded multiple-choice or multi-select question (required correct answer + required explanation). For non-graded questions, use ask_user_question.",
		promptGuidelines: [
			"quiz is GRADED; ask_user_question is not. If the question has a correct answer, use quiz. If you just need a preference, decision, or open-ended input, use ask_user_question.",
			'correctAnswer is REQUIRED and is the option value, not a position number. Single-select: one string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]).',
			"Always pass the option's `value` string as correctAnswer — it is self-checking and prevents miscounting positions. A value that matches no option is a hard error.",
			"explanation is REQUIRED — always say why the correct answer is correct.",
			"Multi-select is graded as an exact-set match: the user is correct only if they select every correct option and no incorrect ones.",
			"There is no free-text mode. An 'I don't know' choice is ALWAYS added automatically — provide ONLY the real, gradable options (at least two). Never add your own uncertainty/opt-out option like 'I don't know', 'I'm not sure', or 'Not sure'; that is handled for you and a manual one would be redundant or gradable-as-wrong.",
			"If a result comes back as dontKnow, the user honestly did not know and did NOT guess — treat it as a genuine knowledge gap to teach into, not as a wrong answer.",
			"Any answer (right, wrong, or 'I don't know') may carry an optional free-text `note` the user attached — the note field exists in every tier (inline in the interactive UI, a skippable prompt after answering in the dialog tier, appended in chat in the plain-chat fallback). When present it reflects what they were thinking or unsure about — read it and let it steer your follow-up. It is omitted entirely when empty.",
			"A result of status 'cancelled' means the USER closed the quiz popup — the quiz tool itself is still available. Do not claim the quiz UI is unavailable, and do not permanently switch to plain-text questions because of a cancel; re-ask the same question later or continue. Only a 'plain_chat' (or 'unavailable') result means the tool cannot deliver in this session.",
			"Option construction style is defined canonically in the teach skill's 'Writing quiz options' section — follow it whenever that skill is loaded: every option is a bare claim (no justification in labels), each distractor is a targeted misconception that is unambiguously wrong on the intended reading (diagnostic, not filler, never a trick), and all options are built by mutating the correct claim so they stay parallel in length, specificity, and formatting — the correct one must not be spottable by shape (longest, most precise, most hedged, or the only one in the right format).",
			"Set multiSelect: true only when more than one option is correct.",
			"Options are shuffled before display by default, so don't worry about which position you list the correct answer in. Set shuffle: false only when option order is meaningful (ordered values, or an 'All/None of the above' option that must stay last).",
			"To probe nuance, ask several quick quiz questions and adapt each one based on the previous answers, rather than writing one giant question.",
		],
		parameters: QuizParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const context = params.details?.trim() || undefined;
			const explanation = params.explanation.trim();
			const mode: QuizMode = params.multiSelect ? "multi-select" : "single-select";

			let options: QuizOption[];
			try {
				options = normalizeOptions(params.options);
			} catch (e) {
				return unavailableResult(params.question, mode, `quiz ${(e as Error).message}`, [], context);
			}

			// Shuffle for display (default on) BEFORE resolving correct indices, so
			// grading matches the order the user sees.
			if (params.shuffle !== false) {
				options = shuffleOptions(options);
			}

			// Emit the true (post-shuffle) display order immediately, before the UI
			// blocks on the user's answer. Listeners such as md-log rely on this to
			// show the question in the SAME order the user actually sees it, instead
			// of the pre-shuffle order the agent originally wrote in its tool call.
			// Deliberately omits correctIndices/explanation — this fires before the
			// user has answered and must not leak the answer.
			onUpdate?.({
				content: [{ type: "text", text: "Awaiting user response..." }],
				details: { options: options.map((o, i) => ({ index: i + 1, label: o.label })) },
			});

			const { indices: correctIndices, error: correctError } = resolveCorrect(
				params.correctAnswer as string | string[],
				options,
			);

			if (signal?.aborted) {
				return cancelledResult(params.question, mode, correctIndices, context);
			}

			if (options.length < 2) {
				return unavailableResult(
					params.question,
					mode,
					"quiz requires at least two options",
					correctIndices,
					context,
				);
			}

			if (correctError) {
				return unavailableResult(params.question, mode, `quiz ${correctError}`, correctIndices, context);
			}

			if (!ctx.hasUI) {
				return plainChatResult(params.question, mode, correctIndices, explanation, options, context);
			}

			return withUILock(async () => {
				const adaptive =
					mode === "single-select"
						? await askSingleChoiceAdaptive(ctx, params.question, context, options, correctIndices, explanation)
						: await askMultiChoiceAdaptive(ctx, params.question, context, options, correctIndices, explanation);
				if (adaptive.kind === "chat") {
					return plainChatResult(params.question, mode, correctIndices, explanation, options, context);
				}
				const response = adaptive.value;
				if (!response) {
					return cancelledResult(params.question, mode, correctIndices, context);
				}
				return buildResult(params.question, context, mode, options, response, correctIndices, explanation);
			});
		},

		renderCall(args, theme) {
			// NOTE: never render correctAnswer or explanation here — it would leak
			// the answer into the transcript before the user responds. We also do NOT
			// enumerate the options here: they are shuffled at execute time, so any
			// order shown during streaming would be stale/misleading. The full option
			// list is rendered — in its true display order — by renderResult after the
			// user answers.
			// args stream in while the tool call is being formed; an invalid option
			// set (e.g. a duplicate value) must degrade to a rendered note, not
			// throw — execute() reports the same problem as a graceful
			// `unavailable` tool result.
			let options: QuizOption[];
			let text = theme.fg("toolTitle", theme.bold("quiz ")) + theme.fg("muted", args.question);
			try {
				options = normalizeOptions(
					args.options as Array<{ label: string; value?: string; description?: string }> | undefined,
				);
			} catch (e) {
				const reason = (e as Error)?.message ?? "unknown error";
				text += theme.fg("warning", ` (invalid options: ${reason})`);
				return new Text(text, 0, 0);
			}
			if (args.multiSelect) {
				text += theme.fg("dim", " [multi-select]");
			}
			if (options.length > 0) {
				const noun = options.length === 1 ? "option" : "options";
				text += theme.fg("dim", ` (${options.length} ${noun})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QuizResultDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			if (details.status === "cancelled") {
				return new Text(theme.fg("warning", details.message || "Cancelled"), 0, 0);
			}
			if (details.status === "unavailable") {
				return new Text(theme.fg("warning", details.message || "quiz unavailable"), 0, 0);
			}

			if (details.status === "plain_chat") {
				return new Text(theme.fg("warning", details.message || "quiz unavailable here — ask in plain text"), 0, 0);
			}

			const correctSet = new Set(details.correctIndices);
			const selectedSet = new Set(details.answers.map((a) => a.index));
			const lines: string[] = [];

			// Full option list in the true (shuffled) display order, with ✓/✗ marks.
			// Falls back to just the selected answers for older results that predate
			// details.options.
			const displayed =
				details.options && details.options.length > 0
					? details.options
					: details.answers.map((a) => ({ index: a.index, label: a.label }));

			for (const opt of displayed) {
				const isSelected = selectedSet.has(opt.index);
				const isKey = correctSet.has(opt.index);
				let mark: string;
				let body: string;
				if (details.dontKnow) {
					// No guess — only reveal the correct answer(s); never show ✗.
					mark = isKey ? theme.fg("success", "✓ ") : "  ";
					body = isKey ? theme.fg("success", `${opt.index}. ${opt.label}`) : theme.fg("dim", `${opt.index}. ${opt.label}`);
				} else if (isSelected && isKey) {
					mark = theme.fg("success", "✓ ");
					body = theme.fg("accent", `${opt.index}. ${opt.label}`);
				} else if (isSelected && !isKey) {
					mark = theme.fg("error", "✗ ");
					body = theme.fg("error", `${opt.index}. ${opt.label}`);
				} else if (!isSelected && isKey) {
					mark = theme.fg("success", "✓ ");
					body = theme.fg("success", `${opt.index}. ${opt.label}`);
				} else {
					mark = "  ";
					body = theme.fg("dim", `${opt.index}. ${opt.label}`);
				}
				lines.push(`${mark}${body}`);
			}

			lines.push("");
			const verdict = details.dontKnow
				? theme.fg("warning", "I don't know")
				: details.correct
					? theme.fg("success", "Correct!")
					: theme.fg("error", "Incorrect");
			lines.push(verdict);

			if (details.note) {
				lines.push(theme.fg("muted", `Note: ${details.note}`));
			}

			if (details.explanation) {
				lines.push(theme.fg("muted", details.explanation));
			}

			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
