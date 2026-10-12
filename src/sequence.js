// Plays the Higgsfield footage as an image sequence on a canvas. Scroll picks the frame;
// at each stop the full-resolution keyframe still fades in over the video frame.

// Driven by the scroll timeline in main.js; draw() only reads it.
export const view = { frame: 0, still: 0, stillAlpha: 1 };

const CONCURRENCY = 6;

export async function createSequence(canvas, { onProgress }) {
  const res = await fetch('/seq/manifest.json');
  if (!res.ok) throw new Error(`Could not load /seq/manifest.json (${res.status})`);
  const manifest = await res.json();

  const small = matchMedia('(max-width: 760px)').matches;
  const size = small ? manifest.sizes[manifest.sizes.length - 1] : manifest.sizes[0];
  const frameUrl = (i) => `/seq/${size}/f_${String(i).padStart(4, '0')}.webp`;
  const frames = new Array(manifest.count);
  const stills = new Array(manifest.keyframes.length);
  let loadedVersion = 0;

  const load = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => img.decode().catch(() => {}).then(() => resolve(img));
      img.onerror = () => resolve(null); // a missing frame falls back to its nearest neighbour
      img.src = url;
    });

  const run = async (jobs, onEach) => {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        await jobs[next++]();
        loadedVersion++;
        onEach?.();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  };

  const frameJob = (i) => () => load(frameUrl(i)).then((img) => (frames[i] = img));
  const stillJob = (i) => () => load(`/seq/stills/k${i}.webp`).then((img) => (stills[i] = img));

  // first stop and the first camera move gate the reveal; everything else streams in behind it
  const firstJobs = [stillJob(0)];
  for (let i = 0; i <= manifest.keyframes[1]; i++) firstJobs.push(frameJob(i));
  let done = 0;
  const ready = run(firstJobs, () => onProgress(++done / firstJobs.length)).then(() => {
    const rest = [];
    for (let s = 1; s < stills.length; s++) rest.push(stillJob(s));
    for (let i = manifest.keyframes[1] + 1; i < manifest.count; i++) rest.push(frameJob(i));
    run(rest);
  });

  const ctx = canvas.getContext('2d', { alpha: false });
  let drawn = '';

  const nearest = (i) => {
    for (let d = 0; d < frames.length; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  };

  const cover = (img) => {
    const { width: cw, height: ch } = canvas;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  };

  function draw() {
    const i = Math.min(manifest.count - 1, Math.max(0, Math.round(view.frame)));
    const key = `${i}|${view.still}|${view.stillAlpha.toFixed(3)}|${canvas.width}x${canvas.height}|${loadedVersion}`;
    if (key === drawn) return;
    drawn = key;
    const img = nearest(i);
    if (img) cover(img);
    const still = stills[view.still];
    if (still && view.stillAlpha > 0.001) {
      ctx.globalAlpha = view.stillAlpha;
      cover(still);
      ctx.globalAlpha = 1;
    }
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.imageSmoothingQuality = 'high';
    drawn = '';
  }
  resize();

  return { keyframes: manifest.keyframes, ready, draw, resize };
}
