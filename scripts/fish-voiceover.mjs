#!/usr/bin/env node
// Generate the voiceover for a video project with Fish Audio (Drama 3 by default), plus word timestamps
// in the @remotion/captions `Caption` format.
//
// Usage (from the folder that holds videos/; <skill> is this skill's folder):
//   node <skill>/scripts/fish-voiceover.mjs videos/<slug> [--force] [--speed 1.15] [--voice <id>] [--model <model>]
//   node <skill>/scripts/fish-voiceover.mjs videos/<slug> --from-raw   # rebuild captions from the saved timing (free)
//
// Reads   videos/<slug>/narration.txt   (Drama 3 directions like [excited] and tags like <emphasis> allowed)
// Writes  videos/<slug>/public/voiceover.mp3
//         videos/<slug>/src/captions.json             (Caption[]: text, startMs, endMs, timestampMs, confidence)
//         videos/<slug>/voiceover-timestamps.json     (Fish's raw timing segments)
// --force moves the previous take to videos/<slug>/takes/<n>/ before generating a new one.
//
// Env (or a .env file in the current folder or this skill's folder): FISH_API_KEY (required), FISH_VOICE_ID,
// FISH_MODEL (default drama-3), FISH_SPEED (default 1.15).
// Docs: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech-stream-with-timestamps
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_FLAGS = ['--speed', '--voice', '--model'];
const projectDir = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
if (!projectDir) {
  console.error('usage: node <skill>/scripts/fish-voiceover.mjs videos/<slug> [--force] [--speed 1.15] [--voice <id>] [--model <model>] [--from-raw]');
  process.exit(1);
}
const FROM_RAW = args.includes('--from-raw');

// Load .env from the current folder, then from this skill's folder, without overriding real env vars.
const skillDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const envFile of [path.join(process.cwd(), '.env'), path.join(skillDir, '.env')]) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.FISH_API_KEY;
if (!KEY && !FROM_RAW) {
  console.error('FISH_API_KEY is not set. Add FISH_API_KEY=<your key> to a .env file in this folder (the key is on ' +
    'the API keys page of your Fish Audio account), or export it in your shell.');
  process.exit(1);
}
const MODEL = flag('--model') || process.env.FISH_MODEL || 'drama-3';
const VOICE = flag('--voice') || process.env.FISH_VOICE_ID || '';
const SPEED = Number(flag('--speed') || process.env.FISH_SPEED || 1.15);

const narrationPath = path.join(projectDir, 'narration.txt');
if (!fs.existsSync(narrationPath)) {
  console.error(`missing ${narrationPath}`);
  process.exit(1);
}
const narration = fs.readFileSync(narrationPath, 'utf8').trim();
const audioOut = path.join(projectDir, 'public', 'voiceover.mp3');
const captionsOut = path.join(projectDir, 'src', 'captions.json');
const rawOut = path.join(projectDir, 'voiceover-timestamps.json');

// The script as Fish reads it: directions removed, each paired tag kept as a marker (Fish times tags as
// tokens too). Stray punctuation (a dash, the period after a closing tag) joins the word before it.
const TAG = /<\/?([a-z]+)>/gi;
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const stripped = narration
  .replace(/\[[^\]]*\]/g, ' ')                     // [delivery directions], [sounds], [pauses]
  .replace(/<\|phoneme_start\|>.*?<\|phoneme_end\|>/g, ' ')
  .replace(/<\|[^|]*\|>/g, ' ')                    // <|speaker:0|> and other control tokens
  .replace(TAG, (_, name) => ` \u0000${name.toLowerCase()} `);
const stream = [];
for (const t of stripped.split(/\s+/).filter(Boolean)) {
  if (t.startsWith('\u0000')) stream.push({ tag: t.slice(1) });
  else if (norm(t)) stream.push({ word: t });
  else {
    const last = [...stream].reverse().find((x) => x.word);
    if (last) last.word += (/^[.,!?;:)'"’”]/.test(t) ? '' : ' ') + t;
  }
}
const words = stream.filter((x) => x.word).map((x) => x.word);
const tagNames = new Set(stream.filter((x) => x.tag).map((x) => x.tag));

async function generate() {
  if (fs.existsSync(audioOut) && fs.existsSync(captionsOut)) {
    if (!args.includes('--force')) {
      console.log(`${audioOut} already exists (pass --force to generate a new take).`);
      process.exit(0);
    }
    // Keep the previous take: every take is billed.
    const takesDir = path.join(projectDir, 'takes');
    const n = fs.existsSync(takesDir) ? fs.readdirSync(takesDir).length + 1 : 1;
    const keep = path.join(takesDir, String(n));
    fs.mkdirSync(keep, { recursive: true });
    for (const f of [audioOut, captionsOut, rawOut]) {
      if (fs.existsSync(f)) fs.copyFileSync(f, path.join(keep, path.basename(f)));
    }
    console.log(`previous take saved to ${keep}`);
  }

  const body = { text: narration, format: 'mp3', mp3_bitrate: 192, latency: 'normal', prosody: { speed: SPEED } };
  if (VOICE) body.reference_id = VOICE;
  console.log(`Fish Audio ${MODEL}${VOICE ? `, voice ${VOICE}` : ', default voice'}, speed ${SPEED} ...`);
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch('https://api.fish.audio/v1/tts/stream/with-timestamp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', model: MODEL },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    const msg = (await res.text()).slice(0, 300);
    console.error(`attempt ${attempt}: HTTP ${res.status} ${msg}`);
    if (res.status < 500 || attempt === 3) process.exit(1);
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Server-sent events: concatenate audio chunks; keep the latest alignment snapshot per text chunk.
  const audio = [];
  const alignments = new Map();
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const ev of events) {
      const line = ev.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const e = JSON.parse(line.slice(6));
      if (e.audio_base64) audio.push(Buffer.from(e.audio_base64, 'base64'));
      if (e.alignment) alignments.set(e.chunk_seq, { offset: e.chunk_audio_offset_sec, segments: e.alignment.segments });
    }
  }
  fs.mkdirSync(path.dirname(audioOut), { recursive: true });
  fs.writeFileSync(audioOut, Buffer.concat(audio));
  console.log(`wrote ${audioOut}`);

  const segments = [...alignments.keys()].sort((a, b) => a - b).flatMap((k) => {
    const { offset, segments: segs } = alignments.get(k);
    return segs.map((s) => ({ text: s.text, start: s.start + offset, end: s.end + offset }));
  });
  fs.writeFileSync(rawOut, JSON.stringify(segments, null, 2) + '\n');
  return segments;
}

// Map Fish's timed segments onto the script's own words, so captions keep its spelling and punctuation.
// Fish returns one segment per script token, tags included, so when the counts match each word takes its
// own token's segment. Otherwise match by text, skipping the tag names.
function toWords(segments) {
  const timed = segments.filter((s) => norm(s.text));
  if (timed.length === stream.length) {
    return stream.map((x, i) => ({ ...x, ...timed[i] })).filter((x) => x.word)
      .map((x) => ({ text: x.word, start: x.start, end: x.end }));
  }
  const out = [];
  for (const s of timed) {
    if (out.length >= words.length) break;
    if (tagNames.has(norm(s.text)) && norm(s.text) !== norm(words[out.length])) continue;
    out.push({ text: words[out.length], start: s.start, end: s.end });
  }
  return out;
}

// The pauses in the generated audio (ffmpeg silencedetect): [{ start, end }] in seconds.
function findPauses(audioPath) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', audioPath, '-af',
    'silencedetect=noise=-35dB:duration=0.15', '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.error) {
    console.warn('warning: ffmpeg not found, so caption timing is not checked against the audio.');
    return null;
  }
  const pauses = [];
  let start = null;
  for (const line of r.stderr.split('\n')) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) { pauses.push({ start, end: Number(e[1]) }); start = null; }
  }
  return pauses;
}

// Fish's word timing is usually right, but near paired tags (and on some short words) it slips: words come
// back zero-length, overlapping, or shifted into a neighbour's slot. The pauses in the audio are reliable, so
// split the speech into phrases at the pauses, keep Fish's timing inside phrases where it's consistent, and
// re-time the rest of each phrase across its real duration (by Fish's durations, or by word length where Fish
// gave none).
function fitToAudio(timedWords, pauses, rawSegments) {
  if (!pauses || !timedWords.length) return 0;
  const audioEnd = pauses.length && pauses[pauses.length - 1].end > timedWords[timedWords.length - 1].end
    ? pauses[pauses.length - 1].start : timedWords[timedWords.length - 1].end + 0.3;
  const phrases = [];
  let from = 0;
  for (const p of pauses) {
    if (p.start > from) phrases.push({ start: from, end: p.start, words: [] });
    from = p.end;
  }
  if (audioEnd > from) phrases.push({ start: from, end: audioEnd, words: [] });
  if (!phrases.length) return 0;

  // Each word goes to the phrase its timing points at, never to an earlier phrase than the word before it. A
  // word that lands in a pause stays before it if it ends a sentence or clause, else moves after it.
  const endsClause = (w) => /[.?!,;:]["')]*$/.test(w.text);
  let k = 0;
  timedWords.forEach((w) => {
    const mid = (w.start + w.end) / 2;
    while (k < phrases.length - 1 && mid >= phrases[k].end) {
      if (mid < phrases[k + 1].start && endsClause(w)) break;
      k++;
    }
    phrases[k].words.push(w);
  });

  // A phrase's timing is consistent when every word has a real duration, words don't overlap, they sit
  // inside the phrase, and moving the first and last word onto the phrase's edges leaves them a real duration.
  const groups = phrases.filter((ph) => ph.words.length).map((ph) => {
    const ws = ph.words;
    const last = ws[ws.length - 1];
    const consistent = ws.every((w, i) => w.end - w.start >= 0.05 && (i === 0 || w.start >= ws[i - 1].end - 0.02))
      && ws[0].start >= ph.start - 0.15 && last.end <= ph.end + 0.15
      && ws[0].end - ph.start >= 0.05 && ph.end - last.start >= 0.05;
    return { spans: [{ start: ph.start, end: ph.end }], start: ph.start, end: ph.end, words: ws, consistent };
  });
  // Speech with no words assigned is either a sound (a laugh, a breath) or words Fish timed into a neighbour.
  // It's words only when Fish's own timing puts something there: a word or tag segment inside it, or a
  // neighbouring word reaching into it. Then lend it to an inconsistent neighbour: the phrase before if that one
  // stops mid-sentence, else the one after.
  for (const ph of phrases.filter((p) => !p.words.length)) {
    const prev = [...groups].reverse().find((g) => g.end <= ph.start);
    const next = groups.find((g) => g.start >= ph.end);
    const inside = rawSegments.some((s) => s.end > ph.start + 0.05 && s.start < ph.end - 0.05);
    const prevReaches = prev && prev.words[prev.words.length - 1].end > ph.start + 0.05;
    const nextReaches = next && next.words[0].start < ph.end - 0.05;
    if (prev && !prev.consistent && !endsClause(prev.words[prev.words.length - 1]) && (inside || prevReaches)) {
      prev.spans.push(ph);
    } else if (next && !next.consistent && (inside || nextReaches)) {
      next.spans.unshift(ph);
    }
  }

  const voiced = timedWords.filter((w) => w.end - w.start >= 0.05);
  const perLetter = voiced.length
    ? voiced.reduce((a, w) => a + (w.end - w.start), 0) / voiced.reduce((a, w) => a + Math.max(norm(w.text).length, 1), 0)
    : 0.07;
  let retimed = 0;
  for (const g of groups) {
    const ws = g.words;
    if (g.consistent && g.spans.length === 1) {
      ws[0].start = g.spans[0].start;                // speech resumes exactly where the pause ends
      ws[ws.length - 1].end = g.spans[0].end;        // and stops where the next one begins
      continue;
    }
    retimed++;
    // Spread the words over the group's speech time (skipping any pause inside it): Fish's duration for each
    // word where it has one, an estimate from the word's length where it doesn't.
    const weights = ws.map((w) => (w.end - w.start >= 0.05 ? w.end - w.start : Math.max(norm(w.text).length, 1) * perLetter));
    const total = weights.reduce((a, b) => a + b, 0);
    const speech = g.spans.reduce((a, s) => a + (s.end - s.start), 0);
    const at = (x) => {                               // x seconds into the group's speech -> time in the audio
      for (const s of g.spans) {
        if (x <= s.end - s.start + 1e-9) return s.start + x;
        x -= s.end - s.start;
      }
      return g.spans[g.spans.length - 1].end;
    };
    let x = 0;
    ws.forEach((w, i) => {
      const d = (speech * weights[i]) / total;
      w.start = at(x + 1e-6);
      w.end = at(x + d);
      x += d;
    });
  }
  return retimed;
}

const segments = FROM_RAW ? JSON.parse(fs.readFileSync(rawOut, 'utf8')) : await generate();
const timedWords = toWords(segments);
const pauses = findPauses(audioOut);
const retimed = fitToAudio(timedWords, pauses, segments.filter((s) => norm(s.text)));
if (pauses) console.log(`checked against ${pauses.length} pauses in the audio; re-timed ${retimed} phrase(s) where Fish's timing slipped`);

// Give every word a visible duration (min 80 ms), never overlapping the next one.
const captions = timedWords.map((c, i) => {
  const next = timedWords[i + 1];
  let end = Math.max(c.end, c.start + 0.08);
  if (next && next.start > c.start) end = Math.min(end, next.start);
  const startMs = Math.round(c.start * 1000);
  const endMs = Math.max(Math.round(end * 1000), startMs + 1);
  return { text: (i ? ' ' : '') + c.text, startMs, endMs, timestampMs: Math.round((startMs + endMs) / 2), confidence: null };
});
fs.mkdirSync(path.dirname(captionsOut), { recursive: true });
fs.writeFileSync(captionsOut, JSON.stringify(captions, null, 2) + '\n');

const durationS = captions.length ? captions[captions.length - 1].endMs / 1000 : 0;
const wpm = Math.round((captions.length / durationS) * 60);
console.log(`wrote ${captionsOut} (${captions.length} words)`);
console.log(`speech ends at ${durationS.toFixed(2)} s, ${wpm} words per minute`);
if (!FROM_RAW && (wpm < 130 || wpm > 175)) {
  // Pace moves a little less than the speed setting (about 0.85× as much), so aim from the measured take.
  const suggested = Math.round(SPEED * Math.pow(150 / wpm, 1 / 0.85) * 20) / 20;
  console.log(`for about 150 wpm, re-run with --speed ${suggested} --force`);
}
if (captions.length < words.length) {
  console.error(`ERROR: ${words.length - captions.length} script word(s) got no timestamp, starting at ` +
    `"${words[captions.length]}". The audio is fine, but the captions are incomplete: compare src/captions.json ` +
    `with voiceover-timestamps.json.`);
  process.exit(1);
}
