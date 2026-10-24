# Explainer Video Skill for Claude Code, voiced by Fish Audio

A Claude Code skill that turns a topic into a narrated, captioned explainer video (1080×1920, ready for Reels, TikTok
and Shorts). The voice is [Fish Audio](https://fish.audio/?fpr=jesse28)'s **Drama 3**, the text-to-speech model you
can direct like an actor.

| Step | What happens |
|---|---|
| **Script** | Claude writes a 30–90 s script, or uses yours word for word |
| **Scene plan** | One scene per idea, each line matched to a visual |
| **Voice** | [Fish Audio Drama 3](https://fish.audio/?fpr=jesse28) reads the script, with a timestamp for every word |
| **Scenes** | Animated scenes built in code with [Remotion](https://www.remotion.dev), timed to the voice |
| **Captions** | Word-by-word captions burned in, the current word highlighted |
| **Render** | An MP4, checked on a still of every scene before it's rendered |

## Requirements
- [Claude Code](https://claude.com/claude-code)
- Node.js 20+
- `ffmpeg` on your PATH (macOS: `brew install ffmpeg`)
- A [Fish Audio](https://fish.audio/?fpr=jesse28) account and API key

## Install
Install the skill once and it's available in every project:

```bash
git clone https://github.com/jdrurka/explainer-skill.git ~/.claude/skills/explainer-video
```

Or with the skills CLI:

```bash
npx skills add jdrurka/explainer-skill -g -a claude-code
```

Optional: Remotion's official skills teach Claude Remotion best practices, and the videos come out better with them:

```bash
npx skills add remotion-dev/skills -g -a claude-code
```

## Add your Fish Audio key
Copy an API key from your account's API keys page on [fish.audio](https://fish.audio/?fpr=jesse28). Then, in the
folder where you'll make videos, create a `.env` file:

```bash
FISH_API_KEY=your_key_here
```

Or export `FISH_API_KEY` in your shell. Optional settings go in the same file:

| Setting | Default | What it does |
|---|---|---|
| `FISH_VOICE_ID` | Fish's default voice | Any voice from the [Fish Audio voice library](https://fish.audio/?fpr=jesse28), or your own cloned voice |
| `FISH_MODEL` | `drama-3` | The text-to-speech model |
| `FISH_SPEED` | `1.15` | Speaking speed |

## Use it
Open Claude Code in that folder and ask:

> Make an explainer video about why the sky is blue.

Or bring your own script:

> Make an explainer video from this script, word for word: …

Each video gets its own Remotion project in `videos/<topic>/`, and the finished file lands in
`videos/<topic>/out/<topic>.mp4`. To watch or tweak it in Remotion Studio, run `npm run dev` inside that folder.

## Directing the voice with Fish Audio Drama 3
Drama 3 lets you write stage directions straight into the script. Put them in square brackets before the words they
apply to:

```text
[curious, leaning in] Why is the sky blue?
[small laugh] It's not the ocean. It's <emphasis>the air</emphasis>.
```

- **Directions** in brackets set the emotion, pacing or intent, written the way you'd brief a voice actor.
- **Sounds and pauses** like `[sigh]`, `[small laugh]` or `[short pause]` go exactly where they should happen.
- **Word-level tags** change just a few words: `<whisper>`, `<emphasis>`, `<soft>`, `<fast>`, `<slow>`, `<stress>`,
  `<forceful>`.
- **Directions are performed, not spoken,** and they're kept out of the captions automatically.

The skill's [Drama 3 guide](references/fish-audio-drama-3.md) lists public voices to start with. Fish's own docs:
[Drama 3](https://docs.fish.audio/features/text-to-speech/drama-3).

## What's inside
| Path | What |
|---|---|
| `SKILL.md` | The workflow Claude follows |
| `references/fish-audio-drama-3.md` | Directing the voice, choosing a voice, the voice script's options |
| `scripts/fish-voiceover.mjs` | Fish Audio voiceover plus word timestamps for the captions |
| `scripts/check-video.sh` | A contact sheet of stills, and a check of the final MP4 |

## Notes
- Video rendering is by [Remotion](https://www.remotion.dev). Remotion is free for individuals and teams of up to 3;
  larger companies need a [company license](https://www.remotion.pro/license).
- You pay Fish Audio for your own voice usage.
- Fish Audio links in this README are affiliate links.

## License
MIT. See [LICENSE](LICENSE).
