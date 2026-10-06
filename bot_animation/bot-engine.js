'use strict';

/* Pixel bot animation engine. The app talks to this through window.PocketBots. */
(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BOT_DEFS = [
    { name: 'Zip', body: '#43c6ff', dark: '#1b7aa8', chest: '#c4f1ff' },
    { name: 'Pip', body: '#ff6ad5', dark: '#b03a90', chest: '#ffd0f3' },
    { name: 'Bop', body: '#a6f04f', dark: '#5f9a1c', chest: '#e3ffb8' },
    { name: 'Dot', body: '#ffb02e', dark: '#b3730a', chest: '#ffe2a8' },
  ];
  const MOUTH = { happy: '#4ff08a', neutral: '#d8d2ff', panic: '#ff5470' };
  const LINES = {
    happy: ['Saving is cool!', 'Coins go brrr', 'Budget power!', 'Nice plan!'],
    neutral: ['Careful now...', 'Tap Setup to start!', 'Hmm, how much?'],
    panic: ['LIMIT!! LIMIT!!', 'Put it BACK!', 'Wallet is crying!', 'Abort purchase!'],
    cheer: ['Nice one!', 'Ka-ching!', 'Logged it!', 'Saved! Yay!', 'New loot!'],
    oops: ['Oops! Check that.', 'Hmm, bad input.'],
    del: ['Poof!', 'Gone!'],
  };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const laneBots = [];
  let mascot = null;
  let mood = 'happy';
  let alarmUntil = 0;

  function paintSprite(svg, rows, palette, unit) {
    svg.setAttribute('viewBox', `0 0 ${rows[0].length} ${rows.length}`);
    svg.setAttribute('width', rows[0].length * unit);
    svg.setAttribute('height', rows.length * unit);
    const rects = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!palette[ch]) return;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', 1);
      rect.setAttribute('height', 1);
      rect.setAttribute('fill', palette[ch]);
      rects.push(rect);
    }));
    svg.replaceChildren(...rects);
  }

  function botRows(bot) {
    const edit = (str, changes) => {
      const chars = str.split('');
      Object.entries(changes).forEach(([index, char]) => { chars[index] = char; });
      return chars.join('');
    };
    const base = '.XBBBBBBX.';
    const eye = bot.blink ? 'b' : 'E';
    const [e1, e2] = { l: [2, 5], c: [3, 6], r: [4, 7] }[bot.look];
    const eyes = edit(base, { [e1]: eye, [e2]: eye, ...(bot.mood === 'panic' ? { 9: 'S' } : {}) });
    let mouthTop = base;
    let mouthLow;
    if (bot.mood === 'happy') {
      mouthTop = edit(base, { 3: 'M', 6: 'M' });
      mouthLow = edit(base, { 4: 'M', 5: 'M' });
    } else if (bot.mood === 'panic') {
      mouthTop = edit(base, { 4: 'M', 5: 'M' });
      mouthLow = mouthTop;
    } else {
      mouthLow = edit(base, { 3: 'M', 4: 'M', 5: 'M', 6: 'M' });
    }
    const armsUp = bot.up || bot.mood === 'panic';
    return [
      '....OO....', '....XX....', '.XXXXXXXX.', eyes, mouthTop, mouthLow,
      '.XXXXXXXX.', armsUp ? 'XXBBBBBBXX' : '.XBBBBBBX.',
      armsUp ? '.XBBCCBBX.' : 'XXBBCCBBXX', '.XDDDDDDX.',
      bot.step ? '..XX..XX..' : '.XX....XX.',
    ];
  }

  function drawBot(bot) {
    const key = [bot.look, bot.blink ? 1 : 0, bot.mood, bot.step, bot.up ? 1 : 0].join('');
    if (key === bot.key) return;
    bot.key = key;
    const { body, dark, chest } = bot.def;
    paintSprite(bot.svg, botRows(bot), {
      X: '#0a0620', B: body, b: dark, D: dark, C: chest,
      E: '#fff', O: '#ffd23f', M: MOUTH[bot.mood], S: '#7fe3ff',
    }, bot.unit);
  }

  function makeBot(def, unit) {
    const el = document.createElement('div');
    el.className = 'bot';
    const body = document.createElement('div');
    body.className = 'bot-body';
    const svg = document.createElementNS(SVG_NS, 'svg');
    body.append(svg);
    el.append(body);
    return {
      def, el, body, svg, key: '', look: 'c', blink: false,
      mood: 'happy', step: 0, up: false, x: 0, dir: 1, speed: 0,
      target: null, next: 0, nextTalk: 0, unit,
    };
  }

  function animate(bot, name, duration) {
    bot.body.dataset.anim = '';
    void bot.body.offsetWidth;
    bot.body.dataset.anim = name;
    window.setTimeout(() => {
      if (bot.body.dataset.anim === name) bot.body.dataset.anim = '';
    }, duration);
  }

  function say(bot, text, duration = 2600) {
    bot.el.querySelector('.bubble')?.remove();
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    if (laneBots.includes(bot)) {
      const rect = bot.el.getBoundingClientRect();
      if (rect.left < 90) bubble.classList.add('edge-l');
      else if (window.innerWidth - rect.right < 90) bubble.classList.add('edge-r');
    }
    bot.el.append(bubble);
    window.setTimeout(() => bubble.remove(), duration);
  }

  function activeMood() {
    return Date.now() < alarmUntil ? 'panic' : mood;
  }

  function syncMood() {
    const current = activeMood();
    [mascot, ...laneBots].forEach((bot) => {
      if (!bot) return;
      bot.mood = current;
      bot.el.classList.toggle('panic', current === 'panic');
      drawBot(bot);
    });
  }

  function panic() {
    alarmUntil = Date.now() + 6000;
    syncMood();
    window.setTimeout(syncMood, 6100);
    [mascot, ...laneBots].filter(Boolean).forEach((bot) => animate(bot, 'hop', 500));
    if (mascot) say(mascot, pick(LINES.panic));
  }

  function decide(bot, now, maxX) {
    const isPanicking = activeMood() === 'panic';
    bot.next = now + rnd(700, 2600) / (isPanicking ? 1.8 : 1);
    bot.target = null;
    bot.speed = 0;
    const roll = Math.random();
    if (roll < 0.45) {
      bot.target = rnd(0, maxX);
      bot.dir = bot.target >= bot.x ? 1 : -1;
      bot.speed = rnd(40, 110) * (isPanicking ? 2 : 1);
    } else if (roll < 0.62) animate(bot, 'hop', 500);
    else if (roll < 0.74) {
      bot.dir = Math.random() < 0.5 ? -1 : 1;
      bot.target = bot.dir > 0 ? maxX : 0;
      bot.speed = rnd(220, 320);
    } else if (roll < 0.86) animate(bot, 'spin', 1000);
    if (now >= bot.nextTalk) {
      bot.nextTalk = now + rnd(7000, 14000);
      say(bot, pick(LINES[activeMood()]));
    }
  }

  function tick() {
    if (document.hidden) return;
    const now = Date.now();
    const maxX = Math.max(0, window.innerWidth - 48);
    laneBots.forEach((bot) => {
      if (Math.random() < 0.18) bot.look = pick(['l', 'c', 'r']);
      bot.blink = Math.random() < 0.1;
      if (!reduceMotion) {
        if (now >= bot.next) decide(bot, now, maxX);
        if (bot.speed > 0) {
          bot.x = Math.min(maxX, Math.max(0, bot.x + bot.dir * bot.speed * 0.12));
          bot.step ^= 1;
          if ((bot.dir > 0 && bot.x >= bot.target) || (bot.dir < 0 && bot.x <= bot.target)) {
            bot.speed = 0;
            bot.target = null;
          }
          bot.el.style.transform = `translateX(${Math.round(bot.x / 4) * 4}px)`;
        }
      }
      bot.el.classList.toggle('walking', bot.speed > 0);
      bot.svg.style.transform = bot.dir < 0 ? 'scaleX(-1)' : '';
      drawBot(bot);
    });
    if (mascot) {
      if (Math.random() < 0.25) mascot.look = pick(['l', 'c', 'r']);
      mascot.blink = Math.random() < 0.1;
      drawBot(mascot);
    }
  }

  function start() {
    const lane = document.getElementById('bot-lane');
    const mascotSpot = document.getElementById('mascot');
    if (!lane || !mascotSpot) return;
    const now = Date.now();
    const maxX = Math.max(0, window.innerWidth - 48);
    BOT_DEFS.slice(1).forEach((def, index) => {
      const bot = makeBot(def, 6);
      bot.x = rnd(0, maxX);
      bot.dir = Math.random() < 0.5 ? -1 : 1;
      bot.next = now + index * 500;
      bot.nextTalk = now + rnd(5000, 10000);
      bot.el.style.transform = `translateX(${Math.round(bot.x / 4) * 4}px)`;
      lane.append(bot.el);
      laneBots.push(bot);
    });
    mascot = makeBot(BOT_DEFS[0], 6);
    mascotSpot.append(mascot.el);
    const poke = () => {
      animate(mascot, 'hop', 500);
      say(mascot, pick(LINES[activeMood()]));
    };
    mascotSpot.addEventListener('click', poke);
    mascotSpot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        poke();
      }
    });
    syncMood();
    window.setInterval(tick, 120);
  }

  window.PocketBots = {
    setMood(nextMood) {
      mood = ['happy', 'neutral'].includes(nextMood) ? nextMood : 'happy';
      syncMood();
    },
    say(text, type = 'cheer') {
      if (mascot) say(mascot, text || pick(LINES[type] || LINES.cheer));
    },
    celebrate(text) {
      if (!mascot) return;
      animate(mascot, 'hop', 500);
      say(mascot, text || pick(LINES.cheer));
    },
    panic,
    delete(text) {
      if (!mascot) return;
      animate(mascot, 'spin', 1000);
      say(mascot, text || pick(LINES.del));
    },
    error(text) {
      if (!mascot) return;
      animate(mascot, 'jitter', 500);
      say(mascot, text || pick(LINES.oops));
    },
  };

  start();
})();
