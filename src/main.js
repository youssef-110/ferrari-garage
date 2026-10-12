import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { createSequence, view } from './sequence.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;

const CHAPTERS = ['intro', 'door', 'model', 'air', 'brakes', 'profile', 'engine', 'numbers', 'end'];
const NAV_GROUP = { intro: 'intro', door: 'intro', model: 'design', air: 'design', brakes: 'design', profile: 'design', engine: 'engine', numbers: 'numbers', end: 'numbers' };

const root = document.documentElement;
const canvas = document.getElementById('scene');
const loader = document.querySelector('.loader');
const countEl = document.getElementById('load-count');
const barEl = document.getElementById('load-bar');
const chapterEl = document.getElementById('chapter');
const progressEl = document.querySelector('.progress span');
const navLinks = [...document.querySelectorAll('.nav__list a')];

history.scrollRestoration = 'manual';
scrollTo(0, 0);
root.style.overflow = 'hidden';

const shown = { value: 0 };
const showProgress = (p) =>
  gsap.to(shown, {
    value: p,
    duration: 0.5,
    ease: 'power2.out',
    overwrite: true,
    onUpdate: () => {
      countEl.textContent = Math.round(shown.value * 100);
      barEl.style.transform = `scaleX(${shown.value})`;
    },
  });

init().catch(fail);

async function init() {
  const seq = await createSequence(canvas, { onProgress: showProgress });
  await document.fonts.ready;
  const panels = buildPanels();
  const tl = buildTimeline(panels, seq.keyframes);
  document.getElementById('track').style.height = `${Math.round(tl.duration() * (small ? 50 : 60))}vh`;

  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.08 });
  if (lenis) {
    lenis.stop();
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  gsap.ticker.add(seq.draw);

  const st = ScrollTrigger.create({
    trigger: '#track',
    start: 'top top',
    end: 'bottom bottom',
    animation: tl,
    scrub: reducedMotion ? true : 0.7,
  });
  updateChrome(tl);
  if (import.meta.env.DEV) window.__tl = tl;

  // jump a little past the label so the chapter's text is already in
  const scrollFor = (label) => {
    const time = label === 'intro' ? 0 : tl.labels[label] + 0.45;
    return st.start + (st.end - st.start) * (time / tl.duration());
  };
  document.querySelectorAll('[data-goto]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const top = scrollFor(a.dataset.goto);
      if (lenis) lenis.scrollTo(top, { duration: 2.6 });
      else scrollTo({ top });
    })
  );

  addEventListener('resize', seq.resize);
  if (!reducedMotion && !small) {
    // a few pixels of parallax so the stills breathe under the cursor
    const px = gsap.quickTo(canvas, 'x', { duration: 1.2, ease: 'power3.out' });
    const py = gsap.quickTo(canvas, 'y', { duration: 1.2, ease: 'power3.out' });
    addEventListener('pointermove', (e) => {
      px(-((e.clientX / innerWidth) * 2 - 1) * 14);
      py(-((e.clientY / innerHeight) * 2 - 1) * 9);
    });
  }

  await seq.ready;
  showProgress(1);
  intro(panels.hero, lenis);
}

function buildPanels() {
  const panels = {};
  for (const el of document.querySelectorAll('[data-panel]')) {
    const name = el.dataset.panel;
    const split = el.querySelector('[data-split]');
    const type = name === 'hero' ? 'chars' : 'words';
    const words = split ? SplitText.create(split, { type, mask: type, [`${type}Class`]: 'word' })[type] : [];
    const fades = [...el.querySelectorAll('.body, .end__side > *, .specs > div')];
    panels[name] = { el, words, fades };
    if (name !== 'hero') {
      gsap.set(el, { autoAlpha: 0 });
      if (words.length) gsap.set(words, { yPercent: 110 });
      if (fades.length) gsap.set(fades, { autoAlpha: 0 });
    }
  }
  return panels;
}

// K[n] is the frame index of stop n; clip n moves the camera from stop n-1 to stop n
function buildTimeline(panels, K) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: () => updateChrome(tl) });

  const show = (name, at) => {
    const { el, words, fades } = panels[name];
    tl.addLabel(name, at);
    tl.set(el, { autoAlpha: 1 }, at);
    if (words.length) tl.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out', immediateRender: false }, at);
    if (fades.length) tl.fromTo(fades, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out', immediateRender: false }, at + 0.12);
  };
  const hide = (name, at) => {
    const { el, words, fades } = panels[name];
    if (words.length) tl.to(words, { yPercent: -110, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, at);
    if (fades.length) tl.to(fades, { autoAlpha: 0, y: -18, duration: 0.25, ease: 'power2.in' }, at);
    tl.set(el, { autoAlpha: 0 }, at + 0.4);
  };
  // leave the sharp still, scrub the footage, then settle on the next still
  const clip = (n, at, duration) => {
    if (n >= K.length) return;
    tl.to(view, { stillAlpha: 0, duration: 0.15 }, at);
    tl.fromTo(view, { frame: K[n - 1] }, { frame: K[n], duration, ease: 'power1.inOut', immediateRender: false }, at);
    tl.set(view, { still: n }, at + duration - 0.2);
    tl.to(view, { stillAlpha: 1, duration: 0.2 }, at + duration - 0.2);
  };

  // the room, the door opens on a dark garage
  tl.addLabel('intro', 0);
  tl.to(panels.hero.el, { autoAlpha: 0, y: -40, duration: 0.45, ease: 'power2.in' }, 0.45);
  clip(1, 0.5, 1.8);
  show('door', 0.7);
  hide('door', 1.6);

  // the lights come on and the camera walks up to the car
  clip(2, 2.6, 1.6);
  show('model', 4.2);
  hide('model', 5.3);

  clip(3, 5.35, 1.2);
  show('air', 6.55);
  hide('air', 7.6);

  clip(4, 7.65, 1.2);
  show('brakes', 8.85);
  hide('brakes', 9.9);

  // along the flank to the rear
  clip(5, 9.95, 1.6);
  show('profile', 10.15);
  hide('profile', 11.1);
  show('engine', 11.55);
  hide('engine', 12.6);

  // back out to the whole car
  clip(6, 12.65, 1.5);
  show('numbers', 14.15);
  hide('numbers', 15.4);
  show('end', 15.5);
  tl.to({}, { duration: 1.1 }, 15.5);
  return tl;
}

let currentChapter = '';
function updateChrome(tl) {
  progressEl.style.transform = `scaleX(${tl.progress()})`;
  const label = tl.currentLabel() || 'intro';
  if (label === currentChapter) return;
  currentChapter = label;
  chapterEl.textContent = String(CHAPTERS.indexOf(label) + 1).padStart(2, '0');
  for (const a of navLinks) a.setAttribute('aria-current', String(a.dataset.group === NAV_GROUP[label]));
}

function intro(hero, lenis) {
  const unlock = () => {
    root.style.overflow = '';
    lenis?.start();
  };
  if (reducedMotion) {
    gsap.to(loader, { autoAlpha: 0, duration: 0.3 });
    unlock();
    return;
  }
  gsap
    .timeline({ delay: 0.3 })
    .to(loader, { autoAlpha: 0, duration: 0.8, ease: 'power2.inOut' })
    .fromTo(canvas, { scale: 1.09 }, { scale: 1.035, duration: 2.6, ease: 'power3.out' }, 0)
    .from(hero.words, { yPercent: 110, duration: 1.5, stagger: 0.06, ease: 'expo.out' }, 0.6)
    .from('.hero__tagline, .hero__card, .hero__cue, .nav, .counter, .serial, .progress', { autoAlpha: 0, y: 12, duration: 0.9, stagger: 0.08, ease: 'power2.out' }, 1.0)
    .add(unlock, 1.1);
}

function fail(err) {
  console.error(err);
  document.querySelector('.loader__label').textContent = 'The footage could not load. Check your connection and reload the page.';
  document.querySelector('.loader__count').hidden = true;
  document.querySelector('.loader__bar').hidden = true;
}
