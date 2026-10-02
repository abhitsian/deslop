#!/usr/bin/env node
// Deslop server: the extension sends the text of the block you clicked, this asks Claude what in it is
// slop, and returns exact phrases with their replacements. No dependencies. Needs Node 18 or later.
//
//   ANTHROPIC_API_KEY=sk-ant-... node server/server.js
//
// Settings (environment): PORT (default 5055), DESLOP_MODEL (default claude-sonnet-5-5).
const http = require("http");
const PORT = Number(process.env.PORT || 5055);
const MODEL = process.env.DESLOP_MODEL || "claude-sonnet-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;

// One call to the Messages API. followUp = { reply, fix } sends the model its own reply and a correction.
async function claude({ system, user, maxTokens = 4000, followUp = null }) {
  if (!KEY) throw Object.assign(new Error("ANTHROPIC_API_KEY is not set. Start the server with your key."), { status: 500 });
  const messages = [{ role: "user", content: user }];
  if (followUp) messages.push({ role: "assistant", content: followUp.reply }, { role: "user", content: followUp.fix });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body.error && body.error.message) || "Claude answered " + res.status), { status: 502 });
  return { text: (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), model: MODEL };
}

function parseJSON(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("model reply had no JSON: " + text.slice(0, 160));
  return JSON.parse(text.slice(s, e + 1));
}
const countWords = (s) => (String(s || "").match(/\b[\w'’-]+\b/g) || []).length;

const DESLOP_SYSTEM = `You clean up a piece of writing someone is reading on the web, often a LinkedIn post. Find the slop and give the replacement for each piece. The reader watches each flagged phrase get blasted out of the page and the replacement painted in, so every edit must leave text that reads correctly.

What counts as slop, grouped by where it sits:

Openers and closers
- Announcing and throat-clearing: "I'm thrilled to share", "I'm humbled to announce", "Here's the thing", "Let me be clear", "Let's dive in", "Before we begin", "It's worth noting that".
- Openers about the era or the industry: "In today's fast-paced world", "In the age of AI".
- False exclusivity: "What nobody tells you", "The part everyone misses", "Here's what most people get wrong".
- Hook lines that withhold the point, and engagement bait: "Agree?", "Thoughts?", "Comment YES", "Tag someone who needs this", "Follow me for more", "Repost if this helped", "Link in the comments", a P.S. that asks for a reaction.
- Closers that restate: "In conclusion", "The bottom line", "At the end of the day", "To sum up", a last paragraph that repeats the post, a closing aphorism or moral.
- Chat residue: "Great question", "I hope this helps", "Here's a breakdown", "Certainly!".

Sentences that carry nothing
- Announcement sentences: "Here's what I found", "This is the part that matters", "The interesting thing is", "Here's why".
- Counting the list before giving it: "3 things stood out", "It comes down to one thing".
- A sentence that only names the topic of the next one, or says the post is about to say something.
- A sentence that restates the one before it, or states the moral right after the example that showed it.
- Performed emphasis: "Let that sink in.", "Read that again.", "Full stop.", "Period.", "Make no mistake", "That's it. That's the post."
- A question the author answers in the next sentence.
- Generic lessons that could be sent to anyone in any industry and still make sense.

Constructions used for drama
- "It's not X, it's Y" in every form: "not just X, but Y", "It isn't about X. It's about Y.", "X, not Y." Keep only Y.
- A short quotable line placed for rhythm that adds no fact. One-line paragraphs for effect.
- Fragment runs: "Fast. Cheap. Reliable." Lists forced to three. Balanced or mirrored clauses on ordinary material.
- A noun phrase, a colon or a dash, then a punchy reveal.
- A despite / while / although clause conceding something the post never discusses.
- A trailing clause that pretends to explain: ", highlighting...", ", underscoring...", ", showcasing...", ", reflecting...".

Hollow words
- The stock vocabulary: delve, tapestry, vibrant, realm, beacon, landscape, journey, navigate, game-changing, revolutionary, groundbreaking, transformative, cutting-edge, world-class, seamless, frictionless, robust, unlock, harness, leverage, elevate, empower, foster, embark, pivotal, crucial, paramount, testament, synergy.
- Intensifiers and filler: truly, really, incredibly, absolutely, extremely, deeply, fundamentally, simply, literally, genuinely, honestly, actually, basically, just.
- Importance flags: crucially, importantly, notably, "plays a vital role", "stands as a testament", "marks a pivotal moment".
- A dressed-up verb where "is" or the plain verb would do: serves as, acts as, stands as, represents, boasts, revolutionized, transformed.
- Stock metaphors where a literal phrase exists: "moves the needle", "where the rubber meets the road", "north star", "double-edged sword".
- Stacked connectives: moreover, furthermore, additionally.

Claims with nothing behind them
- "Studies show", "experts agree", "research suggests" with no named source. Cut the attribution or the claim.
- Hedges on every claim: might, perhaps, arguably, somewhat, generally. A silver-lining sentence after every criticism.

Padding
- Wordy phrases: "in order to" (to), "due to the fact that" (because), "at this point in time" (now), "has the ability to" (can), "a large number of" (many), "each and every" (each), "end result" (result).
- The action buried in a noun: "the implementation of X enables the prevention of Y" (X prevents Y).
- A different synonym each time for the same thing. Repeat the noun.

Formatting as decoration
- Stacked hashtags. Emoji used as bullets, pointers or decoration. Arrows used as bullets.
- Bold or italic made from special Unicode letters: write the same words in plain letters.
- Words in capitals for emphasis.

What is not slop, at any strength: a fact, number, name, date, quote or decision. A first-hand detail only this author could have written. A short label that opens a paragraph. A negation that carries the actual content. A metaphor that is the standard name for the thing. The author's casual voice and humour.

Rules:
- "quote" is an exact, verbatim substring of the text. It sits on a single line and you copy it character for character: punctuation, emoji, capitalisation, spacing.
- "fix" is what replaces the quote: plain words that say the same thing, or "" to cut it. The text must read as correct sentences after the swap. Mind the capital letter, spacing and punctuation at the joins: when a cut would leave a double space, a stray comma or a lower-case sentence start, take the neighbouring space or word into the quote and write the corrected version in the fix.
- Keep the author's facts, names and numbers. Add nothing new.
- A short label that opens a paragraph or list item ("Writing.", "Web pages.", "Step 2:") is structure, not slop. Leave it in place, whole. Never start a fix with a full stop, comma or slash.
- To cut a whole line, quote that line alone. Never quote across a line break.
- Edits must not overlap. Clean text gets an empty list.
- No em dashes in a fix.

How hard to cut: {strength}

Return ONLY JSON: {"edits": [{"quote": "...", "fix": "...", "why": "2 to 5 words"}]}`;

// The dial. Each step widens what counts as slop and how much may go.
const DESLOP_STRENGTH = {
  1: "GENTLE. Touch only the obvious: openers and closers, engagement bait, performed emphasis, formatting as decoration, intensifiers. Leave the author's sentences and opinions as they are. At most 6 edits.",
  2: "FIRM. Everything on the list above. Leave sentences that are fine alone. At most 14 edits, most worthwhile first.",
  3: "RUTHLESS. A sentence stays only if it carries a fact, a number, a decision, or a specific claim the author can stand behind. Platitudes, generic lessons, scene-setting, restated points and motivational lines are cut whole: quote the full sentence and set fix to \"\". Where a sentence has substance wrapped in padding, quote the whole sentence and give the tight version. Aim for half the original length or less. Up to 24 edits.",
  4: "TO THE BONE. Strip it to what happened and what is being claimed, in the fewest plain words. Everything else goes: openers, closers, lists of generic advice, opinions with no support, adjectives, hedges, any sentence a reader would not miss. Rewrite each surviving sentence as short as it can be said. If only one sentence of substance exists, only that sentence survives. Aim for a third of the original length or less. Up to 40 edits.",
};

// When most of a post is slop, patching it phrase by phrase leaves rubble. The extension can bin it
// instead and show this: the same content written once, plainly, from scratch.
const REWRITE_SYSTEM = `Someone is reading this post and most of it is padding. Write it again from scratch for them, keeping only what is real in it.

- Keep every fact, number, name, decision and specific claim the author makes. Add nothing that is not there.
- Plain sentences. Keep the author's first person if the original uses it.
- No hook, no closer, no hashtags, no emoji, no list of generic advice, no em dashes, no "not X but Y".
- As short as the substance allows. If one sentence carries it, write one sentence. Put a blank line between paragraphs.

Return ONLY JSON: {"rewrite": "..."}`;
const BIN_ABOVE = 0.6; // share of the words that must be slop before a post is binned

async function deslop({ text, level, bin }) {
  level = [1, 2, 3, 4].includes(Number(level)) ? Number(level) : 2;
  text = String(text || "").slice(0, 12000);
  if (text.trim().length < 20) throw Object.assign(new Error("Not enough text to deslop."), { status: 400 });
  let out = null, model, followUp = null;
  for (let attempt = 0; attempt < 2 && !out; attempt++) {
    const r = await claude({ system: DESLOP_SYSTEM.replace("{strength}", DESLOP_STRENGTH[level]) + "\n\nReturn valid JSON: escape double quotes and newlines inside strings.", user: `<text>\n${text}\n</text>`, maxTokens: level > 2 ? 5000 : 2500, followUp });
    model = r.model;
    try { out = parseJSON(r.text); } catch (e) { followUp = { reply: r.text, fix: "That reply was not valid JSON. Return the same edits as valid JSON only." }; }
  }
  if (!out) throw new Error("The model did not return usable edits.");
  // Keep the edits whose quote can be found in the text. The model sometimes straightens a curly
  // quote, changes spacing, or quotes across a line break, so matching is tolerant: typographic
  // variants are treated as equal, and a quote that spans lines is split into one edit per line.
  const fold = (c) => ({ "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " " }[c] || c);
  const locate = (quote, from = 0) => {
    const exact = text.indexOf(quote, from);
    if (exact >= 0) return [exact, exact + quote.length];
    // compare with typographic variants folded and runs of spaces collapsed
    const norm = (str) => { let out = "", map = []; for (let i = 0; i < str.length; i++) { const c = fold(str[i]); if (c === " " && out.endsWith(" ")) continue; out += c; map.push(i); } return { out, map }; };
    const T = norm(text), Q = norm(quote.trim()).out;
    if (!Q) return null;
    let k = T.out.indexOf(Q);
    while (k >= 0 && T.map[k] < from) k = T.out.indexOf(Q, k + 1);
    return k < 0 ? null : [T.map[k], T.map[k + Q.length - 1] + 1];
  };
  const taken = [], edits = [];
  let dropped = 0;
  const add = (span, fix, why) => {
    if (!span || taken.some(([a, b]) => span[0] < b && a < span[1])) return false;
    taken.push(span);
    edits.push({ quote: text.slice(span[0], span[1]), fix: String(fix ?? "").replace(/\s*—\s*/g, ", ").replace(/^[.,;:\/]\s*/, ""), why: String(why || "").slice(0, 60), at: span[0] });
    return true;
  };
  for (const e of Array.isArray(out.edits) ? out.edits : []) {
    if (!e || typeof e.quote !== "string" || !e.quote.trim()) continue;
    const lines = e.quote.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1) { if (!add(locate(lines[0]), e.fix, e.why)) dropped++; continue; }
    // A quote across several lines. Lines the fix repeats word for word are left alone (the model
    // quoted them only to reach the line it wanted gone). What is left pairs up one to one when the
    // counts match; otherwise the first changed line takes the replacement and the others are cut.
    let from = 0, ok = true; const spans = [];
    for (const l of lines) { const sp = locate(l, from); if (!sp) { ok = false; break; } spans.push(sp); from = sp[1]; }
    if (!ok) { dropped++; continue; }
    const fixLines = String(e.fix ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const changed = [];
    lines.forEach((l, i) => { const k = fixLines.indexOf(l); if (k >= 0) fixLines.splice(k, 1); else changed.push(spans[i]); });
    const paired = changed.length === fixLines.length;
    changed.forEach((sp, i) => add(sp, paired ? fixLines[i] : i === 0 ? fixLines.join(" ") : "", e.why));
  }
  edits.sort((a, b) => a.at - b.at);
  // how much of it is slop: words inside the flagged phrases, less the words their replacements put back
  const total = countWords(text) || 1;
  const fraction = Math.min(1, Math.max(0, edits.reduce((n, e) => n + countWords(e.quote) - countWords(e.fix), 0) / total));
  let rewrite = null;
  if (bin && fraction > BIN_ABOVE) {
    try {
      const hard = level >= 3 ? "\n- Generic lessons, platitudes and borrowed sayings are not substance. Leave them out." : "";
      const r = await claude({ system: REWRITE_SYSTEM.replace("\n\nReturn ONLY", hard + "\n\nReturn ONLY") + "\n\nReturn valid JSON: escape double quotes and newlines inside strings.", user: `<text>\n${text}\n</text>`, maxTokens: 2000 });
      rewrite = String(parseJSON(r.text).rewrite || "").replace(/\s*—\s*/g, ", ").trim() || null;
    } catch (e) { rewrite = null; }
  }
  return { edits, model, level, dropped, words: total, fraction: Math.round(fraction * 100) / 100, rewrite };
}

http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && req.url === "/") return send(200, { ok: true, name: "deslop", model: MODEL, key: !!KEY });
  if (req.method !== "POST" || req.url !== "/api/deslop") return send(404, { error: "Not found." });
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 200000) req.destroy(); });
  req.on("end", async () => {
    try { send(200, await deslop(JSON.parse(body || "{}"))); }
    catch (e) { send(e.status || 500, { error: e.message }); }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Deslop server on http://localhost:${PORT} (${MODEL})${KEY ? "" : "  [ANTHROPIC_API_KEY is not set]"}`));
