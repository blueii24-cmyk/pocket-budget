'use strict';

/* ==========================================================================
   STORAGE — the ONLY place that touches localStorage.
   To move to Firebase later, replace the bodies of loadData() and saveData().
   Shape: { "YYYY-MM": { pocketMoney, busFare, budgets, savingsGoal, expenses, cart } }
   ========================================================================== */
const STORAGE_KEY = 'pocketBudget.v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.error('Could not load data', err);
    return {};
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Could not save data', err);
    return false;
  }
}

/* ==========================================================================
   STATE & HELPERS
   ========================================================================== */
let data = loadData();
let monthKey = currentMonthKey();
let draftBudgets = [];

const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (list, key) => round2(list.reduce((t, x) => t + (Number(x[key]) || 0), 0));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ==========================================================================
   RETRO FX — chiptune sound effects (Web Audio) and pixel sprites.
   Sound on/off is a UI preference only, kept under its own key (not budget data).
   ========================================================================== */
const SOUND_KEY = 'pocketBudget.sound';

const sfx = (() => {
  let ctx = null;
  let enabled = true;
  try { enabled = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (err) { /* keep default */ }

  // [frequency Hz, start offset s, duration s, waveform]
  const SOUNDS = {
    blip:  [[880, 0, .05, 'square']],
    tab:   [[660, 0, .05, 'square'], [990, .05, .07, 'square']],
    coin:  [[988, 0, .07, 'square'], [1319, .07, .3, 'square']],
    save:  [[523, 0, .08, 'square'], [659, .08, .08, 'square'], [784, .16, .08, 'square'], [1047, .24, .3, 'square']],
    buy:   [[523, 0, .07, 'square'], [659, .07, .07, 'square'], [784, .14, .07, 'square'], [1047, .21, .07, 'square'], [1319, .28, .3, 'square']],
    del:   [[392, 0, .06, 'square'], [262, .06, .14, 'square']],
    error: [[160, 0, .12, 'sawtooth'], [110, .14, .22, 'sawtooth']],
    warn:  [[440, 0, .1, 'square'], [370, .12, .1, 'square'], [294, .24, .1, 'square'], [220, .36, .35, 'square']],
    start: [[262, 0, .12, 'square'], [330, .12, .12, 'square'], [392, .24, .12, 'square'], [523, .36, .12, 'square'], [392, .48, .1, 'square'], [523, .6, .45, 'triangle']],
  };

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function play(name) {
    const notes = SOUNDS[name];
    if (!enabled || !notes) return;
    const c = context();
    if (!c) return;
    const t0 = c.currentTime + 0.01;
    notes.forEach(([freq, offset, dur, type]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const vol = type === 'triangle' ? 0.14 : type === 'sawtooth' ? 0.04 : 0.05;
      const t = t0 + offset;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.setValueAtTime(vol, t + dur * 0.7);
      gain.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (err) { /* ignore */ }
    if (on) play('blip');
  }

  return { play, setEnabled, get enabled() { return enabled; } };
})();

// 10x10 pixel-art coin. X = outline, O = gold, H = highlight, D = shade.
const COIN_ART = [
  '...XXXX...',
  '..XHHOOX..',
  '.XHOODOOX.',
  'XHOODOOODX',
  'XHOODOOODX',
  'XOOODOOODX',
  'XOOODOOODX',
  '.XOODOODX.',
  '..XDDDDX..',
  '...XXXX...',
];
const COIN_PALETTE = { X: '#3b2300', O: '#ffc82e', H: '#fff1a8', D: '#d08a00' };

/** Builds a crisp SVG from rows of palette letters ('.' = transparent). */
function pixelSprite(rows, palette, unit) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${rows[0].length} ${rows.length}`);
  svg.setAttribute('width', rows[0].length * unit);
  svg.setAttribute('height', rows.length * unit);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!palette[ch]) return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', 1);
    r.setAttribute('height', 1);
    r.setAttribute('fill', palette[ch]);
    svg.append(r);
  }));
  return svg;
}

/** Re-triggers a CSS animation class on a node. */
function restartAnimation(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/** Sets text and does a little pixel hop when the value changed. */
function setValue(node, text) {
  if (node.textContent === text) return;
  node.textContent = text;
  restartAnimation(node, 'bump');
}

// id of the item just added, so its list row can pop in
let freshId = null;

/** Plays the 'warn' jingle if an action just pushed safe-to-spend below zero. */
function playSpendSound(safeBefore, normalSound) {
  const crossed = safeBefore >= 0 && compute(getMonth()).safeToSpend < 0;
  sfx.play(crossed ? 'warn' : normalSound);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function formatRs(n) {
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return (n < 0 ? '-Rs ' : 'Rs ') + abs;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function todayForMonth() {
  const d = new Date();
  const today = `${currentMonthKey()}-${String(d.getDate()).padStart(2, '0')}`;
  return monthKey === currentMonthKey() ? today : `${monthKey}-01`;
}

/** Returns the selected month's record with defaults filled in (does not save). */
function getMonth() {
  const m = data[monthKey] || {};
  return {
    pocketMoney: Number(m.pocketMoney) || 0,
    busFare: Number(m.busFare) || 0,
    budgets: Array.isArray(m.budgets) ? m.budgets : [],
    savingsGoal: Number(m.savingsGoal) || 0,
    expenses: Array.isArray(m.expenses) ? m.expenses : [],
    cart: Array.isArray(m.cart) ? m.cart : [],
  };
}

function updateMonth(mutator) {
  const m = getMonth();
  mutator(m);
  data[monthKey] = m;
  if (!saveData(data)) toast('Could not save — browser storage unavailable');
}

/* ==========================================================================
   CORE MATH
   safeToSpend = pocketMoney - busFare - sum(budgets) - savingsGoal - sum(expenses)
   ========================================================================== */
function compute(m) {
  const budgetsTotal = sum(m.budgets, 'amount');
  const expensesTotal = sum(m.expenses, 'amount');
  const setAside = round2(m.busFare + budgetsTotal);
  const safeToSpend = round2(m.pocketMoney - m.busFare - budgetsTotal - m.savingsGoal - expensesTotal);
  return { budgetsTotal, expensesTotal, setAside, safeToSpend };
}

/** Walks the cart in the order added, spending from the remaining safe-to-spend. */
function evaluateCart(m) {
  let remaining = compute(m).safeToSpend;
  const results = m.cart.map((item) => {
    if (item.price <= remaining) {
      remaining = round2(remaining - item.price);
      return { item, ok: true, left: remaining };
    }
    return { item, ok: false, short: round2(item.price - remaining) };
  });
  return { results, remainingAfter: remaining, total: sum(m.cart, 'price') };
}

/* ==========================================================================
   VALIDATION
   ========================================================================== */
/** Returns { value } or { error }. Rejects empty, non-numeric and negative values. */
function parseAmount(input, label, { allowZero = true } = {}) {
  const raw = input.value.trim();
  if (raw === '') return { error: `${label} is required.` };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { error: `${label} must be a number.` };
  if (value < 0) return { error: `${label} cannot be negative.` };
  if (!allowZero && value === 0) return { error: `${label} must be more than 0.` };
  return { value: round2(value) };
}

function showError(el, message, inputs = []) {
  el.textContent = message;
  el.hidden = !message;
  inputs.forEach((i) => i.classList.toggle('invalid', !!message));
  if (message) sfx.play('error');
}

let toastTimer;
function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

/** Small DOM builder; uses textContent so user input is never parsed as HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function renderAll() {
  $('month-label').textContent = monthLabel(monthKey);
  renderDashboard();
  renderSplit();
  renderCart();
  freshId = null;
}

function renderDashboard() {
  const m = getMonth();
  const c = compute(m);

  setValue($('val-safe'), formatRs(c.safeToSpend));
  const safeCard = $('card-safe');
  const turnedNegative = c.safeToSpend < 0 && !safeCard.classList.contains('negative');
  safeCard.classList.toggle('negative', c.safeToSpend < 0);
  if (turnedNegative) restartAnimation(safeCard, 'shake');
  $('sub-safe').textContent = c.safeToSpend < 0
    ? `Over budget by ${formatRs(-c.safeToSpend)}`
    : `Spent so far: ${formatRs(c.expensesTotal)}`;

  setValue($('val-aside'), formatRs(c.setAside));
  $('sub-aside').textContent = `Bus ${formatRs(m.busFare)} + budgets ${formatRs(c.budgetsTotal)}`;
  setValue($('val-saving'), formatRs(m.savingsGoal));

  $('expense-total').textContent = m.expenses.length ? `· ${formatRs(c.expensesTotal)} total` : '';
  const list = $('expense-list');
  list.replaceChildren();
  [...m.expenses].reverse().forEach((e) => {
    const li = el('li', e.id === freshId ? 'item pop-in' : 'item');
    const main = el('div', 'item-main');
    main.append(el('div', 'item-name', e.name), el('div', 'item-meta', formatDate(e.date)));
    const del = el('button', 'btn btn-del', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete expense ${e.name}`);
    del.addEventListener('click', () => deleteExpense(e.id));
    li.append(main, el('div', 'item-amount', formatRs(e.amount)), del);
    list.append(li);
  });
}

function renderSplit() {
  const m = getMonth();
  const c = compute(m);
  const parts = {
    bus: m.busFare, budgets: c.budgetsTotal, saving: m.savingsGoal,
    spent: c.expensesTotal, safe: Math.max(c.safeToSpend, 0),
  };
  const total = Math.max(m.pocketMoney, Object.values(parts).reduce((a, b) => a + b, 0));
  document.querySelectorAll('#split-bar [data-seg]').forEach((s) => {
    s.style.width = total ? `${(parts[s.dataset.seg] / total) * 100}%` : '0';
  });
  Object.keys(parts).forEach((k) => { $('lg-' + k).textContent = formatRs(parts[k]); });
}

function renderCart() {
  const m = getMonth();
  const { results, remainingAfter, total } = evaluateCart(m);
  const safeNow = compute(m).safeToSpend;

  $('cart-total').textContent = formatRs(total);
  setSigned($('cart-safe-now'), safeNow);
  setSigned($('cart-safe-after'), remainingAfter);

  const list = $('cart-list');
  list.replaceChildren();
  results.forEach(({ item, ok, left, short }) => {
    const li = el('li', `item cart-item ${ok ? 'is-ok' : 'is-bad'}${item.id === freshId ? ' pop-in' : ''}`);

    const top = el('div', 'cart-top');
    top.append(el('div', 'item-name', item.name), el('div', 'item-amount', formatRs(item.price)));

    const badge = el('span', `badge ${ok ? 'badge-ok' : 'badge-bad'}`,
      ok ? `Affordable, ${formatRs(left)} left after this` : `Short by ${formatRs(short)}`);

    const actions = el('div', 'item-actions');
    const buy = el('button', 'btn btn-small btn-buy', 'Bought');
    buy.type = 'button';
    buy.addEventListener('click', () => buyItem(item.id));
    const del = el('button', 'btn btn-del', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete ${item.name} from cart`);
    del.addEventListener('click', () => deleteCartItem(item.id));
    actions.append(buy, del);

    const badgeRow = el('div');
    badgeRow.append(badge);
    li.append(top, badgeRow, actions);
    list.append(li);
  });
}

function setSigned(node, value) {
  node.textContent = formatRs(value);
  node.classList.toggle('negative', value < 0);
}

/* ----- Setup form ----- */
function renderSetup() {
  const m = getMonth();
  $('in-pocket').value = m.pocketMoney || '';
  $('in-bus').value = m.busFare || '';
  $('in-saving').value = m.savingsGoal || '';
  draftBudgets = m.budgets.map((b) => ({ ...b }));
  showError($('setup-error'), '');
  renderBudgetRows();
}

function renderBudgetRows() {
  const wrap = $('budget-rows');
  wrap.replaceChildren();
  draftBudgets.forEach((b, i) => {
    const row = el('div', 'row');

    const name = document.createElement('input');
    name.type = 'text';
    name.placeholder = 'e.g. Food';
    name.maxLength = 40;
    name.value = b.name;
    name.setAttribute('aria-label', 'Budget category name');
    name.addEventListener('input', () => { b.name = name.value; });

    const amtWrap = el('div', 'input-wrap');
    amtWrap.append(el('span', 'prefix', 'Rs'));
    const amt = document.createElement('input');
    amt.type = 'number';
    amt.inputMode = 'decimal';
    amt.min = '0';
    amt.step = 'any';
    amt.placeholder = '0';
    amt.value = b.amount;
    amt.setAttribute('aria-label', 'Budget amount');
    amt.addEventListener('input', () => { b.amount = amt.value; updatePreview(); });
    amtWrap.append(amt);

    const rm = el('button', 'btn btn-del', '✕');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove category');
    rm.addEventListener('click', () => {
      draftBudgets.splice(i, 1);
      renderBudgetRows();
      sfx.play('del');
    });

    row.append(name, amtWrap, rm);
    wrap.append(row);
  });
  updatePreview();
}

function updatePreview() {
  const n = (v) => Math.max(Number(v) || 0, 0);
  const left = round2(
    n($('in-pocket').value) - n($('in-bus').value) - n($('in-saving').value) -
    draftBudgets.reduce((t, b) => t + n(b.amount), 0)
  );
  setSigned($('setup-preview'), left);
}

/* ==========================================================================
   ACTIONS
   ========================================================================== */
function saveSetup(e) {
  e.preventDefault();
  const errBox = $('setup-error');
  const fields = [
    ['in-pocket', 'Pocket money'],
    ['in-bus', 'Bus fare'],
    ['in-saving', 'Savings goal'],
  ];
  const values = {};
  const inputs = fields.map(([id]) => $(id));
  inputs.forEach((i) => i.classList.remove('invalid'));

  for (const [id, label] of fields) {
    const r = parseAmount($(id), label);
    if (r.error) { showError(errBox, r.error); $(id).classList.add('invalid'); $(id).focus(); return; }
    values[id] = r.value;
  }

  const budgets = [];
  const rows = $('budget-rows').children;
  for (let i = 0; i < draftBudgets.length; i++) {
    const name = String(draftBudgets[i].name || '').trim();
    const nameInput = rows[i].querySelector('input[type="text"]');
    const amtInput = rows[i].querySelector('input[type="number"]');
    rows[i].querySelectorAll('input').forEach((x) => x.classList.remove('invalid'));
    if (!name) {
      showError(errBox, `Budget category ${i + 1} needs a name.`);
      nameInput.classList.add('invalid'); nameInput.focus(); return;
    }
    const r = parseAmount(amtInput, `Amount for "${name}"`);
    if (r.error) {
      showError(errBox, r.error);
      amtInput.classList.add('invalid'); amtInput.focus(); return;
    }
    budgets.push({ name, amount: r.value });
  }

  showError(errBox, '');
  updateMonth((m) => {
    m.pocketMoney = values['in-pocket'];
    m.busFare = values['in-bus'];
    m.savingsGoal = values['in-saving'];
    m.budgets = budgets;
  });
  renderSetup();
  renderAll();
  toast('Saved');
  sfx.play('save');
}

function addExpense(e) {
  e.preventDefault();
  const nameIn = $('exp-name');
  const amtIn = $('exp-amount');
  const name = nameIn.value.trim();
  [nameIn, amtIn].forEach((i) => i.classList.remove('invalid'));

  if (!name) { showError($('expense-error'), 'Please enter a name.'); nameIn.classList.add('invalid'); nameIn.focus(); return; }
  const r = parseAmount(amtIn, 'Amount', { allowZero: false });
  if (r.error) { showError($('expense-error'), r.error); amtIn.classList.add('invalid'); amtIn.focus(); return; }

  showError($('expense-error'), '');
  const safeBefore = compute(getMonth()).safeToSpend;
  const id = newId();
  updateMonth((m) => m.expenses.push({ id, name, amount: r.value, date: todayForMonth() }));
  freshId = id;
  nameIn.value = '';
  amtIn.value = '';
  nameIn.focus();
  renderAll();
  playSpendSound(safeBefore, 'coin');
}

function deleteExpense(id) {
  updateMonth((m) => { m.expenses = m.expenses.filter((x) => x.id !== id); });
  renderAll();
  sfx.play('del');
}

function addCartItem(e) {
  e.preventDefault();
  const nameIn = $('cart-name');
  const priceIn = $('cart-price');
  const name = nameIn.value.trim();
  [nameIn, priceIn].forEach((i) => i.classList.remove('invalid'));

  if (!name) { showError($('cart-error'), 'Please enter an item name.'); nameIn.classList.add('invalid'); nameIn.focus(); return; }
  const r = parseAmount(priceIn, 'Price', { allowZero: false });
  if (r.error) { showError($('cart-error'), r.error); priceIn.classList.add('invalid'); priceIn.focus(); return; }

  showError($('cart-error'), '');
  const id = newId();
  updateMonth((m) => m.cart.push({ id, name, price: r.value }));
  freshId = id;
  nameIn.value = '';
  priceIn.value = '';
  nameIn.focus();
  renderAll();
  sfx.play('blip');
}

function deleteCartItem(id) {
  updateMonth((m) => { m.cart = m.cart.filter((x) => x.id !== id); });
  renderAll();
  sfx.play('del');
}

function buyItem(id) {
  let bought = null;
  const safeBefore = compute(getMonth()).safeToSpend;
  updateMonth((m) => {
    const item = m.cart.find((x) => x.id === id);
    if (!item) return;
    bought = item;
    m.cart = m.cart.filter((x) => x.id !== id);
    freshId = newId();
    m.expenses.push({ id: freshId, name: item.name, amount: item.price, date: todayForMonth() });
  });
  renderAll();
  if (bought) {
    toast(`"${bought.name}" moved to expenses`);
    playSpendSound(safeBefore, 'buy');
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  ['setup', 'dashboard', 'cart'].forEach((p) => { $('panel-' + p).hidden = p !== name; });
}

function changeMonth(delta) {
  monthKey = shiftMonth(monthKey, delta);
  renderSetup();
  renderAll();
  sfx.play('blip');
}

/* ==========================================================================
   INIT
   ========================================================================== */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  switchTab(t.dataset.tab);
  sfx.play('tab');
}));
$('month-prev').addEventListener('click', () => changeMonth(-1));
$('month-next').addEventListener('click', () => changeMonth(1));
$('setup-form').addEventListener('submit', saveSetup);
$('add-budget').addEventListener('click', () => {
  draftBudgets.push({ name: '', amount: '' });
  renderBudgetRows();
  const names = $('budget-rows').querySelectorAll('input[type="text"]');
  names[names.length - 1].focus();
  sfx.play('blip');
});
['in-pocket', 'in-bus', 'in-saving'].forEach((id) => $(id).addEventListener('input', updatePreview));
$('expense-form').addEventListener('submit', addExpense);
$('cart-form').addEventListener('submit', addCartItem);

renderSetup();
renderAll();
// First visit for this month with nothing set up: start on Setup.
if (!data[monthKey]) switchTab('setup');

/* ----- Retro extras: sprites, sound toggle, start screen ----- */
$('brand-coin').append(pixelSprite(COIN_ART, COIN_PALETTE, 3));
$('splash-coin').append(pixelSprite(COIN_ART, COIN_PALETTE, 9));

function renderSoundToggle() {
  const btn = $('sound-toggle');
  btn.textContent = sfx.enabled ? 'SND: ON' : 'SND: OFF';
  btn.setAttribute('aria-pressed', String(sfx.enabled));
}
$('sound-toggle').addEventListener('click', () => {
  sfx.setEnabled(!sfx.enabled);
  renderSoundToggle();
});
renderSoundToggle();

const SPLASH_KEY = 'pocketBudget.splashSeen'; // per-tab-session UI flag
const splash = $('splash');
const appRoot = document.querySelector('.app');

function onSplashKey(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    closeSplash();
  }
}

function closeSplash() {
  if (splash.classList.contains('out')) return;
  sfx.play('start');
  try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch (err) { /* ignore */ }
  document.removeEventListener('keydown', onSplashKey);
  appRoot.inert = false;
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);
}

let splashSeen = false;
try { splashSeen = sessionStorage.getItem(SPLASH_KEY) === '1'; } catch (err) { /* ignore */ }
if (splashSeen) {
  splash.remove();
} else {
  appRoot.inert = true;
  $('start-btn').addEventListener('click', closeSplash);
  document.addEventListener('keydown', onSplashKey);
  $('start-btn').focus();
}
