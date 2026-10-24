# Directing the voice with Fish Audio Drama 3

Drama 3 is Fish Audio's text-to-speech model built for voice direction: alongside the script you describe how each
line should be performed, add sounds and pauses, and change the delivery of specific words. Source:
https://docs.fish.audio/features/text-to-speech/drama-3

The voice script (`<skill>/scripts/fish-voiceover.mjs`) sends `narration.txt` as written, so everything below goes
straight into that file. The script removes directions and tags from the captions automatically.

## Describe the delivery in your own words

Put a direction in square brackets before the words it applies to. Write it the way you'd brief a voice actor:
emotion, intent, pacing, or who the narrator is talking to.

```text
[curious, leaning in] Why is the sky blue?
[barely holding it together, forcing a smile] I'm fine. Really. Go on without me.
```

Directions can be in any language, whatever the language of the script.

## Add sounds and pauses

Put a sound or pause in brackets exactly where it should happen:

```text
I'm fine. [shaky breath] Really. [small laugh] Go on without me.
```

## Change only specific words

Wrap words in a paired tag to change the delivery of those words only. Supported tags: `<whisper>`, `<emphasis>`,
`<soft>`, `<fast>`, `<slow>`, `<stress>`, `<forceful>`.

```text
It isn't the ocean. It's <emphasis>the air</emphasis>.
```

## Writing `narration.txt`

- Keep it to the spoken words only: no headings, labels or notes, since anything in brackets is read as a direction.
- Numbers, dates and units are spoken as words automatically (Fish's text normalization is on by default). The
  captions show them as you wrote them.
- To pin how a name or term is pronounced, Drama 3 accepts phoneme tags; see the Pronunciation section of the
  Drama 3 docs.

## Choosing a voice

The voice decides much of the acting, so pick one that fits the topic. Public voices from Fish's Drama 3 docs:

| Name | Language | ID |
|---|---|---|
| Adrian | EN-US, male | `bf322df2096a46f18c579d0baa36f41d` |
| Delia | EN-US, female | `c70cfb98867a4bfb9ae20d2401257b92` |
| Sheila | EN-US, female | `f3a2b90078d54a65af4b95f63bc7798e` |

Browse more in the Fish Audio voice library, or clone your own voice on fish.audio and use its model ID. Set it as
`FISH_VOICE_ID` in your `.env`, or pass `--voice <id>` for one take. With no voice set, Fish uses its default voice.

## Voice script options

```bash
node <skill>/scripts/fish-voiceover.mjs videos/<slug> [--voice <id>] [--speed 1.15] [--model drama-3] [--force] [--from-raw]
```

| Option | Default | What it does |
|---|---|---|
| `--voice` | `FISH_VOICE_ID`, else Fish's default voice | The voice (`reference_id`) |
| `--speed` | `FISH_SPEED`, else 1.15 | Speaking speed (Fish `prosody.speed`). Drama 3 at 1.0 reads around 130 wpm, slow for short-form |
| `--model` | `FISH_MODEL`, else `drama-3` | The TTS model header. A typo falls back to `s2.1-pro` without an error |
| `--force` | off | Generates a new take even if `voiceover.mp3` exists. The previous take is kept in `takes/<n>/` (each take is billed) |
| `--from-raw` | off | Rebuilds `src/captions.json` from the saved `voiceover-timestamps.json` without calling Fish (free), e.g. after fixing a typo in `narration.txt` that doesn't change what's spoken |

It calls `POST /v1/tts/stream/with-timestamp`, saves the audio, saves Fish's raw timing to
`voiceover-timestamps.json`, and maps those timestamps onto the script's own words, so captions keep its spelling
and punctuation.
