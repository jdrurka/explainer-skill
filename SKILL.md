---
name: explainer-video
description: Makes a narrated, captioned explainer video (vertical 1080×1920 MP4) from a topic or a script - writes the script, plans the scenes, records the voiceover with Fish Audio's Drama 3, builds animated scenes in Remotion, burns in word-by-word captions and renders. Use when the user asks for an explainer video, a "how does X work" video, a narrated animated video, or to turn a script into a video.
---

# Explainer video

Makes a short vertical explainer (30–90 s): a voiceover, animated scenes that illustrate each line, and captions.
The steps: project → script → scene plan → voice → scenes → captions → render → check.

In the commands below, `<skill>` is this skill's folder (the base directory shown when the skill loads). Videos are
made in the user's current folder, under `videos/<slug>/` (the slug is the topic in kebab-case).

For Remotion questions beyond this file (other APIs, fonts, transitions), use Remotion's official skills if they're
installed, or https://www.remotion.dev/docs.

## Before you start
- Node 20+ and `ffmpeg` / `ffprobe` on PATH.
- A Fish Audio API key as `FISH_API_KEY`, either in the environment or in a `.env` file in the current folder. If
  it's missing, stop and ask the user to add it (it's on the API keys page of their Fish Audio account). Never print
  the key. If the current folder is a git repo, make sure `.env` is in its `.gitignore`.

## 1. Project
Create the Remotion project first (it has to start from an empty folder):

```bash
npx create-video@latest --yes --blank videos/<slug>
cd videos/<slug>
npx remotion add @remotion/google-fonts
rm src/Composition.tsx          # the template's placeholder; Root.tsx is replaced in step 5
cd ../..
```

`create-video` starts its own git repo inside the project; that's harmless. The first `npx remotion compositions`,
`still` or `render` downloads a headless browser (~170 MB) once.

## 2. Script
Write `videos/<slug>/narration.txt`: the exact words to be spoken and nothing else. If the user gave you a script,
use it word for word.

- **Length:** plan on about 2.4 words per second of speech (Drama 3 pauses between sentences), and the video adds
  a 1.5 s end card: words ≈ (target seconds − 1.5) × 2.4. A 30 s video ≈ 70 words, 40 s ≈ 90, 60 s ≈ 140.
- **A shape that suits most topics:**
  1. Open on the question or the problem, in the viewer's own words.
  2. Say why it matters, or what's surprising about it.
  3. Give the answer in one plain sentence.
  4. Walk through how it works in two or three concrete steps.
  5. Land the takeaway, then one call to action.
- **Spoken style:** short sentences, everyday words, and explain any term the moment you use it. One comparison to
  something familiar helps; switching between several confuses.
- **Voice directions (optional):** Drama 3 performs bracketed directions like `[curious]` and word tags like
  `<emphasis>`. See `<skill>/references/fish-audio-drama-3.md`.

## 3. Scene plan
Write `videos/<slug>/plan.md` with one entry per scene:

```
Scene 3: "Blue has short waves, so it bounces off the molecules."
On screen: a short blue wave zig-zagging between grey dots
Moves: the wave travels left to right; each dot it hits flashes
In / out: slides in from the right; cuts to scene 4 on "That bounced blue"
```

- One idea per scene. A new scene usually starts with a new sentence.
- Every line gets a picture of what it says; avoid decoration that doesn't explain anything.
- Pick the look now and keep it for every scene: a background, two or three colors that each mean one thing, one
  font, one way of moving things in and out.

## 4. Voice
```bash
node <skill>/scripts/fish-voiceover.mjs videos/<slug>
```

- It sends `narration.txt` to Fish Audio (`drama-3`), then writes `public/voiceover.mp3` and `src/captions.json`
  (every spoken word with its `startMs` / `endMs`), and prints the words per minute.
- It checks the word timing against the pauses in the audio and re-times any phrase where Fish's timing slipped
  (this happens around `<emphasis>`-style tags); the "re-timed N phrase(s)" line is normal.
- **Voice:** `FISH_VOICE_ID` from the environment or `.env`. If none is set, pass `--voice` with one of the public
  voices in the Drama 3 guide.
- **Pace:** if the take is too slow or fast, it prints the `--speed` to re-run with (`--force` makes a new take; each
  take is billed and the previous one is kept in `takes/`).
- If it ends with an ERROR about missing timestamps, the captions are incomplete: compare `src/captions.json` with
  `voiceover-timestamps.json` (Fish's raw timing). `--from-raw` rebuilds the captions from that file without a new
  take.
- **From here on, all timing comes from `src/captions.json`.**

## 5. Build the composition

`src/Root.tsx`: size the video to the voice.
```tsx
import { Composition } from "remotion";
import captions from "./captions.json";
import { Explainer } from "./Explainer";

const FPS = 30;
const lastMs = captions.length ? captions[captions.length - 1].endMs : 3000;
const durationInFrames = Math.ceil((lastMs / 1000 + 1.5) * FPS); // 1.5 s tail for the end card

export const RemotionRoot: React.FC = () => (
  <Composition id="Explainer" component={Explainer} durationInFrames={durationInFrames}
    fps={FPS} width={1080} height={1920} />
);
```

`src/theme.ts`: load the font once and import `fontFamily` everywhere.
```ts
import { loadFont } from "@remotion/google-fonts/Inter";
export const { fontFamily } = loadFont("normal", { weights: ["600", "800"], subsets: ["latin"] });
```

`src/Explainer.tsx`: the voice, the scenes, the captions on top. Each scene starts on the first word of its line.
```tsx
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import captions from "./captions.json";
import { Captions } from "./Captions";

// Start frame of the first word of a phrase, e.g. at("Here's the trick", fps). It returns the FIRST match, so
// for words that repeat, pass a longer phrase that only occurs once.
const at = (phrase: string, fps: number) => {
  const target = phrase.toLowerCase().split(/\s+/);
  const clean = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  for (let i = 0; i < captions.length; i++) {
    if (target.every((w, j) => clean(captions[i + j]?.text ?? "") === clean(w))) {
      return Math.round((captions[i].startMs / 1000) * fps);
    }
  }
  throw new Error(`phrase not found in captions: ${phrase}`);
};

export const Explainer: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const starts = [0, at("first words of scene two", fps), at("first words of scene three", fps)];
  starts.forEach((s, i) => {
    if (i > 0 && s <= starts[i - 1]) throw new Error(`scene ${i + 1} starts before scene ${i}: use a longer at() phrase`);
  });
  const length = (i: number) => (starts[i + 1] ?? durationInFrames) - starts[i];
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0f14" }}>
      <Html5Audio src={staticFile("voiceover.mp3")} />
      <Sequence from={starts[0]} durationInFrames={length(0)}><SceneOne /></Sequence>
      <Sequence from={starts[1]} durationInFrames={length(1)}><SceneTwo /></Sequence>
      <Sequence from={starts[2]} durationInFrames={length(2)}><SceneThree /></Sequence>
      <Captions />
    </AbsoluteFill>
  );
};
```
Inside a `<Sequence>`, `useCurrentFrame()` starts at 0, so each scene animates from its own start. To time
something inside a scene to a later word, pass the offset in as a prop:
`<SceneTwo hit={at("bounces off", fps) - starts[1]} />`, then animate from `frame - hit` inside the scene.

### Animating scenes
Drive all motion from `useCurrentFrame()`: no CSS transitions, timers, `Date.now()` or `Math.random()` (use
`random(seed)` from `remotion`).

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

// Fade and rise in over 12 frames
const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
const y = interpolate(frame, [0, 12], [40, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

// A springy pop (0 → 1 with a little overshoot)
const pop = spring({ frame, fps, config: { damping: 12 } });

// Items appearing one after another
const itemIn = (i: number) => spring({ frame: frame - i * 8, fps, config: { damping: 14 } });

// An SVG line drawing itself on: <path pathLength={1} strokeDasharray={1} strokeDashoffset={draw} />
const draw = interpolate(frame, [20, 40], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

// A number counting up
const count = Math.round(interpolate(frame, [0, 36], [0, 1500], { extrapolateRight: "clamp" }));
```

Keep the important things in the middle of the frame: leave about 250 px clear at the top and bottom of the
1080×1920 frame for the app's buttons, and keep the lower third free for captions.

## 6. Captions
Captions are a must: most people watch with the sound off. Show a few words at a time, ending each caption at a
sentence end (or a comma), and highlight the word being spoken.

`src/Captions.tsx`:
```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import captions from "./captions.json";
import { fontFamily } from "./theme";

type Word = { text: string; startMs: number; endMs: number };
const words = captions as Word[];
const endsSentence = (w: Word) => /[.?!]["')]*$/.test(w.text.trim());

// Pages of up to 6 words that end at sentence ends (or at a comma once a page has 3 words), never leaving a
// single word alone on a page.
const pages: { startMs: number; endMs: number; words: Word[] }[] = [];
let page: Word[] = [];
words.forEach((w, i) => {
  page.push(w);
  let left = 0; // words left in this sentence after this one
  for (let j = i + 1; j < words.length && !endsSentence(words[j - 1]); j++) left++;
  const clause = /[,;:]["')]*$/.test(w.text.trim()) && page.length >= 3;
  if (endsSentence(w) || i === words.length - 1 || ((page.length >= 6 || clause) && left >= 2)) {
    pages.push({ startMs: page[0].startMs, endMs: w.endMs, words: page });
    page = [];
  }
});

export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  // A page stays up until the next one starts, but clears 0.4 s after its last word during a long pause.
  const current = pages.find((p, k) => ms >= p.startMs && ms < Math.min(pages[k + 1]?.startMs ?? Infinity, p.endMs + 400));
  if (!current) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 420 }}>
      <div style={{ maxWidth: 900, textAlign: "center", fontFamily, fontSize: 64, fontWeight: 800,
        color: "white", textShadow: "0 4px 16px rgba(0,0,0,0.6)", whiteSpace: "pre-wrap" }}>
        {current.words.map((w, i) => (
          <span key={i} style={{ color: ms >= w.startMs && ms < w.endMs ? "#ffd84d" : "white" }}>
            {i === 0 ? w.text.trimStart() : w.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
```

## 7. Check and render
Render stills first (fast, no encoding), look at them, then render the video. Run inside `videos/<slug>/`:

```bash
npx remotion compositions                                    # frames and fps
npx remotion still Explainer out/f-01.png --frame=<a frame inside scene 1>
npx remotion still Explainer out/f-02.png --frame=<a frame inside scene 2>   # …one still per scene
npx remotion still Explainer out/f-end.png --frame=<duration in frames − 1>   # frames count from 0
bash <skill>/scripts/check-video.sh sheet out/sheet.png out/f-*.png
npx remotion render Explainer out/<slug>.mp4
bash <skill>/scripts/check-video.sh spec out/<slug>.mp4
```

Look at the contact sheet (four stills to a row) and fix anything off before the final render:
- Every scene shows what its line says, and the caption on screen matches the line being spoken.
- No text is cut off, off-canvas, or under the captions; captions are at most two lines.
- The same colors, font and motion style throughout.
- The last frame is a clean end card with the call to action.

When it's done, give the user the MP4 path, the narration, and one line per scene describing what's on screen.
