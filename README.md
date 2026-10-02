# Deslop

A Chrome extension that removes the slop from whatever you are reading. Click the toolbar button, click a post or paragraph, and a small construction worker walks a plank above the text, fires a cannon at each piece of filler, and rolls the plain version into the gap. A message at the top gives the word count before and after, with an Undo.

The change is on your screen only. Nothing is posted or sent to the site.

![Deslop on a long post on X](docs/x-post.gif)

Cut to the bone on a LinkedIn post, 226 words down to 114:

![Deslop on a LinkedIn post](docs/linkedin-post.gif)

Both clips are screen recordings of the extension in Chrome at real speed, cropped to the toolbar and the post. The authors are blurred.

## Install

1. Clone this repository.
2. Start the server with your Anthropic API key. It needs Node 18 or later and has no dependencies.

   ```
   ANTHROPIC_API_KEY=sk-ant-... node server/server.js
   ```

3. Open `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and choose the repository folder.
4. Pin the hard-hat icon to the toolbar.

The server listens on `http://localhost:5055`. The extension holds no API key. It sends the text of the block you clicked to the server on your machine, and the server sends it to Claude. Set `DESLOP_MODEL` to use a different Claude model, and `PORT` to move the server (then change `SERVER` in `bg.js` and `host_permissions` in `manifest.json` to match).

## Use

- Click the icon or press Alt+Shift+D. Hover a post: the block that will be cleaned gets a dashed red outline. Click it and a wheel opens where you clicked.
- Esc while picking cancels. Esc while the animation runs skips to the result.
- **Undo** in the message at the top puts the original text back. Reloading the page also does.

Only the words of a post are touched. On X and LinkedIn the picker takes the post's text block wherever you click on the post. Elsewhere it drills down to the block that holds most of the text, so author lines and buttons stay.

## The wheel

- **Worker, Ninja, Chomper, Crane.** Click one and it starts.
  - Worker: walks a plank, fires a cannon, repaints with a roller in red that dries to the text colour.
  - Ninja: drops in on a bamboo pole in a puff of smoke, throws spinning nunchucks that slice the phrase and fly back to his hand, repaints with a brush in black ink.
  - Chomper: a round mouth that leaves the plank, runs along each flagged phrase eating it word by word, then runs the line again while the new words pop out behind it.
  - Crane: a trolley on a girder swings a wrecking ball through each phrase, then lowers the new words in line by line on a hook.
- **Strength.** Each click steps Gentle, Firm, Ruthless, To the bone. The wheel stays open.
  1. Gentle: only the obvious. Announcing lines, engagement bait, hashtag stacks, emoji bullets.
  2. Firm: the full slop list. Sentences that are fine are left alone.
  3. Ruthless: a sentence stays only if it carries a fact, number, decision or specific claim. Aims for half the length.
  4. To the bone: what happened and what is claimed, in the fewest words. Aims for a third.
- **Bin.** On or off. When on and more than 60% of the words are slop at the chosen strength, the post turns into a sheet of paper, is torn in two, crumpled and thrown into a bin, and is written again from scratch.
- **The hub** in the middle runs it with the last style used.

Choices are remembered. A long list of cuts speeds the animation up, so a ruthless pass does not run for minutes.

## What counts as slop

The rules are grouped by where the slop sits.

| Group | Examples |
|---|---|
| Openers and closers | "I'm thrilled to share", "In today's fast-paced world", "What nobody tells you", hook lines that withhold the point, "Agree?", "Repost if this helped", "In conclusion", a closing aphorism, chat residue such as "I hope this helps" |
| Sentences that carry nothing | "Here's what I found", "3 things stood out", a sentence that restates the one before it, the moral stated after the example, "Let that sink in.", a question answered in the next sentence, lessons that could be sent to anyone |
| Constructions used for drama | "It's not X, it's Y" in every form, one-line paragraphs for effect, "Fast. Cheap. Reliable.", lists forced to three, a colon or dash before a punchy reveal, a "despite" clause about something never discussed, a trailing ", highlighting..." clause |
| Hollow words | delve, tapestry, landscape, journey, seamless, robust, unlock, leverage, pivotal; intensifiers such as truly and incredibly; "plays a vital role"; "serves as" where "is" would do; "moves the needle" |
| Claims with nothing behind them | "Studies show" and "experts agree" with no named source, a hedge on every claim, a silver lining after every criticism |
| Padding | "in order to", "due to the fact that", "each and every", the action buried in a noun ("the implementation of X enables the prevention of Y"), a new synonym each time for the same thing |
| Formatting as decoration | hashtag stacks, emoji or arrows as bullets, bold made from special Unicode letters, capitals for emphasis |

Kept at every strength: facts, numbers, names, dates, quotes and decisions; a first-hand detail only the author could have written; paragraph labels such as "Step 2:"; a negation that carries the actual content; the author's casual voice and humour.

Gentle touches only the openers and closers, the performed emphasis, the formatting and the intensifiers. Firm and above use every group. The full instructions are in `server/server.js`.

The rules come from the author's own anti-slop rule set, plus two public catalogues: Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and the LessWrong posts [Hot take: problems with AI prose](https://www.lesswrong.com/posts/nTuKjJBwMtMuuLonA/hot-take-problems-with-ai-prose) and [LLM style slop is absolutely everywhere](https://www.lesswrong.com/posts/yBM2rQ6AJY6MoRGFQ/llm-style-slop-is-absolutely-everywhere).

## How it works

- `bg.js`: the toolbar button injects `content.css` and `content.js` into the current tab. It also relays the text to the server's `POST /api/deslop`, because an https page cannot call localhost itself.
- `content.js`: the picker, the wheel, the text mapping and the animation. The worker, cannon and projectiles live in a shadow root so the page's styles cannot touch them. The page's own text is changed only by wrapping the flagged phrases and swapping in the replacements. Everything is built node by node with no `innerHTML`, since some sites restrict it.
- `server/server.js`: asks Claude for `{edits: [{quote, fix}]}`, exact phrases and what replaces each, or "" to cut. It keeps only the edits whose quote it can find in the text, and returns the share of words that are slop plus a from-scratch rewrite when that share passes 60%.
- The text sent is the visible text of the block you clicked, up to 12,000 characters.

## Try it without installing

Open `test/post.html` and press "Run without the extension". It plays the animation on a sample post with a fixed rewrite, so it needs neither the extension nor the server.

## Limits

- Checked on one long post on X and one on LinkedIn in Chrome, on 2 October 2026. Both sites change their markup often. When the site-specific selectors miss, the picker falls back to the nearest block of text under the pointer.
- Sites that re-render their text (React apps do this when you interact with a post) may put the original text back.
- A rewrite takes 5 to 30 seconds depending on length and strength. The worker keeps reading until it arrives.
- A cut line can leave an extra blank line or a stray leading space behind.
- `server/server.js` shares its prompt and matching code with the private backend the recordings used, but has not yet been run against the API with a key.
