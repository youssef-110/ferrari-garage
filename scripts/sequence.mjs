// Turns the Higgsfield footage into the scroll image sequence the site plays.
// usage: node scripts/sequence.mjs <footage-dir>
// expects <footage-dir>/clip1.mp4 .. clipN.mp4 (camera moves) and k0.png .. kN.png (keyframe stills)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const FPS = 12;
const SIZES = [1600, 960];
const STILL_WIDTH = 2560;
const OUT = 'public/seq';

const src = process.argv[2];
assert(src, 'pass the footage folder: node scripts/sequence.mjs <footage-dir>');

const clips = readdirSync(src)
  .filter((f) => /^clip\d+\.mp4$/.test(f))
  .sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));
assert(clips.length > 0, `no clip1.mp4 .. clipN.mp4 in ${src}`);

const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const countIn = (dir) => readdirSync(dir).length;

rmSync(OUT, { recursive: true, force: true });
for (const w of SIZES) mkdirSync(join(OUT, String(w)), { recursive: true });
mkdirSync(join(OUT, 'stills'), { recursive: true });

// one continuous numbering across clips; keyframes[i] is the frame where stop i sits
const keyframes = [0];
let start = 0;
for (const clip of clips) {
  for (const w of SIZES) {
    ff('-i', join(src, clip), '-vf', `fps=${FPS},scale=${w}:-2`, '-c:v', 'libwebp', '-quality', '72',
      '-start_number', String(start), join(OUT, String(w), 'f_%04d.webp'));
  }
  start = countIn(join(OUT, String(SIZES[0])));
  keyframes.push(start - 1);
}

for (let i = 0; i < keyframes.length; i++) {
  ff('-i', join(src, `k${i}.png`), '-vf', `scale=${STILL_WIDTH}:-2`, '-c:v', 'libwebp', '-quality', '82',
    join(OUT, 'stills', `k${i}.webp`));
}

// every size must have the same frames, or scroll positions would point at different moments
for (const w of SIZES) assert.equal(countIn(join(OUT, String(w))), start, `frame count mismatch at ${w}px`);
assert.equal(countIn(join(OUT, 'stills')), clips.length + 1, 'need one still per stop (clips + 1)');

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ count: start, fps: FPS, sizes: SIZES, keyframes }));
console.log(`${clips.length} clips, ${start} frames, stops at ${keyframes.join(', ')}`);
