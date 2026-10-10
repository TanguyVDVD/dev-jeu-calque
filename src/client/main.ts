// Screens and wiring. Menus are HTML and CSS; only the arena is a canvas.
// Player names only ever reach the page through textContent.
import { ARENAS } from '../shared/arena';
import { realClock } from '../shared/clock';
import { logoSvg } from '../shared/logo';
import { AUTO_ROUNDS, MAX_ROUNDS, MIN_ROUNDS, NAME_MAX, cleanName, type PodiumMsg, type ResultsMsg, type RoundMsg } from '../shared/protocol';
import type { Run } from '../shared/sim';
import { audio } from './audio';
import { Bench, OnlinePlay, Replay, Sandbox, TrainingPlay, hide, perf, resizeAll, show, type Hud, type Stage } from './game';
import { DEMOS, Demo } from './howto';
import { input, keyLabels } from './input';
import { View } from './render';
import { Session, type RoomMsg } from './session';
import { TX } from './texts';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode: nothing is remembered */ } },
};
const prefs: { vol: number; shake: boolean; tips: boolean } = { vol: 0.7, shake: true, tips: true, ...JSON.parse(store.get('prefs') || '{}') };
const savePrefs = () => store.set('prefs', JSON.stringify(prefs));

const stage = document.getElementById('stage')!;
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const swatch = (color: number) => el('i', `sw c${color}`);
const arenaButtons = (id: string) => `<div class="row" id="${id}">${ARENAS.map((a, i) => `<button class="small" data-i="${i}">${a.name}</button>`).join('')}</div>`;

stage.insertAdjacentHTML('beforeend', `
<div id="hud" hidden><div id="h-round"></div><div id="h-clock">15,0</div><div id="h-scores"></div></div>
<div id="count" hidden></div><div id="toasts"></div><div id="net" hidden>${TX.hud.reconnecting}</div>
<div id="results" hidden></div>

<section id="s-home" class="screen grid">
  <div>
    <div class="logo">${logoSvg()}</div>
    <p class="tagline">${TX.tagline}</p>
    <p class="pitch">${TX.home.pitch}</p>
    <div class="cast"><i class="sw c0"></i><i class="sw c0"></i><i class="sw c1"></i><i class="sw c2"></i><i class="sw c3"></i></div>
  </div>
  <div class="home-form">
    <div class="box"><label for="h-name">${TX.home.pseudo}</label><input type="text" id="h-name" maxlength="${NAME_MAX}" placeholder="${TX.home.pseudoHint}" autocomplete="off" spellcheck="false"></div>
    <div class="row"><button id="h-create" class="primary">${TX.home.create}</button></div>
    <div class="row"><input type="text" id="h-code" maxlength="4" placeholder="${TX.home.codeHint}" aria-label="${TX.home.code}" autocomplete="off" spellcheck="false"><button id="h-join">${TX.home.join}</button></div>
    <div class="row wrap"><button id="h-train">${TX.home.training}</button><button id="h-howto">${TX.home.howto}</button><button id="h-settings">${TX.home.settings}</button></div>
    <div id="h-train-pick" hidden><p class="hint">${TX.home.trainingHint}</p>${arenaButtons('h-arenas')}</div>
    <p id="h-error" class="error" role="alert"></p>
  </div>
</section>

<section id="s-lobby" class="screen grid" hidden>
  <div>
    <h2>${TX.lobby.title}<span class="code" id="l-code"></span></h2>
    <div class="box"><label for="l-link">${TX.lobby.link}</label><div class="row"><input type="text" id="l-link" readonly><button id="l-copy" class="small">${TX.lobby.copy}</button></div></div>
    <div class="box"><label>${TX.lobby.players}</label><ul id="l-players"></ul></div>
    <div class="box"><label>${TX.lobby.color}</label><div class="row" id="l-colors">${TX.colors.map((c, i) => `<button data-i="${i}" aria-label="${c}"><i class="sw c${i}"></i></button>`).join('')}</div></div>
  </div>
  <div class="right">
    <canvas id="sandbox"></canvas>
    <p class="hint">${TX.lobby.sandbox}</p>
    <div class="box" id="l-settings"><label>${TX.lobby.settings}</label>
      <div class="row"><span class="lbl">${TX.lobby.arena}</span>${arenaButtons('l-arenas')}</div>
      <div class="row"><span class="lbl">${TX.lobby.rounds}</span><button class="small" id="l-less">-</button><b id="l-rounds" style="font-size:1.6em;min-width:3.4em;text-align:center"></b><button class="small" id="l-more">+</button>
        <span class="lbl" style="width:auto;margin-left:1em">${TX.lobby.double}</span><button class="small" id="l-double"></button></div>
    </div>
    <div class="row end" style="margin-top:1.2em"><span id="l-note" class="hint" style="flex:1"></span><button id="l-leave">${TX.lobby.leave}</button><button id="l-ready"></button><button id="l-start" class="primary">${TX.lobby.start}</button></div>
  </div>
</section>

<section id="s-howto" class="screen grid" hidden>
  <h2>${TX.howto.title}</h2>
  <div class="cards">${TX.howto.cards.map(([t, d]) => `<div class="card"><canvas></canvas><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  <div class="box"><label>${TX.howto.keys}</label><dl class="keys">
    <dt>${TX.howto.move}</dt><dd id="k-move"></dd><dt>${TX.howto.jump}</dt><dd id="k-jump"></dd>
    <dt>${TX.howto.dash}</dt><dd id="k-dash"></dd><dt>${TX.howto.drop}</dt><dd>${TX.howto.dropKeys}</dd>
    <dt>${TX.howto.emote}</dt><dd>${TX.howto.emoteKeys}</dd>
  </dl></div>
  <div class="row end" style="margin-top:1em"><span class="hint" style="flex:1">${TX.howto.pad}</span><button id="w-back" class="primary">${TX.howto.back}</button></div>
</section>

<section id="s-podium" class="screen grid" hidden>
  <div><h2>${TX.podium.title}</h2><p id="p-head" style="font-size:2em"></p><ol id="p-rank"></ol><div id="p-awards"></div></div>
  <div class="right" style="display:flex;flex-direction:column">
    <p class="hint">${TX.podium.ballet}</p><canvas id="ballet"></canvas>
    <div class="row end" style="margin-top:1em"><span id="p-note" class="hint"></span></div>
    <div class="row end" style="margin-top:.8em"><button id="p-lobby" class="small">${TX.podium.lobby}</button><button id="p-arena" class="small">${TX.podium.arena}</button><button id="p-rematch" class="primary">${TX.podium.rematch}</button></div>
  </div>
</section>

<div id="settings" hidden><div class="box"><label>${TX.settings.title}</label>
  <div class="line"><span>${TX.settings.volume}</span><input type="range" id="o-vol" min="0" max="100" aria-label="${TX.settings.volume}"></div>
  <div class="line"><span>${TX.settings.shake}</span><button class="small" id="o-shake"></button></div>
  <div class="line"><span>${TX.settings.tips}</span><button class="small" id="o-tips"></button></div>
  <div class="line"><span>${TX.howto.keys}</span><span id="o-keys" class="hint"></span></div>
  <div class="row end" style="margin-top:1em"><button id="o-quit" hidden>${TX.lobby.leave}</button><button id="o-full">${TX.settings.fullscreen}</button><button id="o-close" class="primary">${TX.settings.close}</button></div>
</div></div>
`);
// Touch-only devices get a full-window note instead of the 16:9 sheet.
document.body.insertAdjacentHTML('beforeend', `<section id="mobile" class="grid" hidden><div class="logo">${logoSvg()}</div><h2>${TX.mobile[0]}</h2><p>${TX.mobile[1]}</p></section>`);

// ---- stage size: a 16:9 sheet, scaled to the window -------------------------------------------
const views: View[] = [];
const view = new View($<HTMLCanvasElement>('game'));
views.push(view);
function fit() {
  document.documentElement.style.setProperty('--u', Math.max(0.5, Math.min(innerWidth / 640, innerHeight / 360)) + 'px');
  resizeAll();
}
addEventListener('resize', fit);
fit();
const refreshViews = () => { for (const v of views) { v.shakeOn = prefs.shake; v.setEmoteTexts(TX.emotes); } };
refreshViews();
void document.fonts?.ready.then(refreshViews); // glyphs are pre-rendered: redo them once the real fonts are in

// ---- screens ----------------------------------------------------------------------------------
let session: Session | null = null, play: OnlinePlay | null = null, training: TrainingPlay | null = null;
let sandbox: Sandbox | null = null, ballet: Replay | null = null, demos: Demo[] = [], bench: Stage | null = null;
let room: RoomMsg | null = null, prevTicks: number[] = [], focusArena = false, balletView: View | null = null;

function screen(id: string | null) {
  for (const s of stage.querySelectorAll<HTMLElement>('.screen')) s.hidden = s.id !== id;
  const inGame = id === null;
  $('hud').hidden = !inGame; $('game').style.visibility = inGame ? 'visible' : 'hidden';
  if (!inGame) { $('results').hidden = true; $('count').hidden = true; $('toasts').textContent = ''; stage.querySelector('#announce')?.remove(); }
  if (id !== 's-lobby') { hide(sandbox); }
  if (id !== 's-podium') { hide(ballet); ballet = null; }
  if (id !== 's-howto') { for (const d of demos) hide(d); }
  if (!inGame) { hide(play); hide(training); audio.stopMusic(); }
}

const hud: Hud = {
  round: (t) => { $('h-round').textContent = t; },
  clock: (tenths, late) => { const c = $('h-clock'); c.textContent = `${Math.floor(tenths / 10)},${tenths % 10}`; c.classList.toggle('late', late); },
  countdown: (n) => {
    const c = $('count');
    c.hidden = false; c.textContent = n ? String(n) : TX.go; c.className = '';
    void c.offsetWidth; // restart the stamp animation
    c.className = n ? 'pop' : 'go';
  },
  announce: (t) => { stage.querySelector('#announce')?.remove(); const a = el('div', '', t); a.id = 'announce'; stage.append(a); },
  toast: (t) => {
    const box = $('toasts'), d = el('div', 'toast', t);
    while (box.childElementCount >= 2) box.firstElementChild!.remove();
    box.append(d);
    setTimeout(() => d.remove(), 3100);
  },
};

function chips(scores: number[] | null) {
  const box = $('h-scores');
  box.textContent = '';
  if (!room || !scores) return;
  for (const p of room.players) {
    if (p.seat < 0) continue;
    const c = el('div', 'chip' + (p.id === session?.id ? ' me' : '') + (p.on ? '' : ' off'));
    c.append(swatch(p.color), el('span', 'nm', p.name), el('b', '', String(scores[p.seat])));
    box.append(c);
  }
}
const nameOf = (seat: number) => room?.players.find((p) => p.seat === seat)?.name ?? '?';
const colorOf = (seat: number) => room?.players.find((p) => p.seat === seat)?.color ?? 0;

// ---- home -------------------------------------------------------------------------------------
const nameInput = $<HTMLInputElement>('h-name'), codeInput = $<HTMLInputElement>('h-code');
nameInput.value = store.get('name') ?? '';
const linkCode = /^\/r\/([A-Za-z]{4})$/.exec(location.pathname)?.[1].toUpperCase() ?? '';
codeInput.value = linkCode;

function home(error = '') {
  screen('s-home');
  $('h-error').textContent = error;
  if (location.pathname !== '/') history.replaceState(null, '', '/');
}

function connect(code: string) {
  const name = cleanName(nameInput.value);
  if (!nameInput.value.trim()) { nameInput.focus(); $('h-error').textContent = TX.home.pseudo + ' ?'; return; }
  store.set('name', name);
  session?.leave();
  const s = (session = new Session({ url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, WS: WebSocket, clock: realClock(), store }));
  s.on.room = onRoom;
  s.on.round = onRound;
  s.on.results = onResults;
  s.on.podium = onPodium;
  s.on.emote = (seat, e) => { view.emote(seat, e); audio.sfx('emote'); };
  s.on.status = (online) => { $('net').hidden = online || !room; };
  s.on.error = (c) => { leave(); home(TX.errors[c as keyof typeof TX.errors] ?? c); };
  s.connect(name, code);
}

function leave() {
  session?.leave(); session = null; room = null;
  hide(play); play = null; hide(training); training = null;
  $('net').hidden = true;
  home();
}

$('h-create').onclick = () => connect('');
$('h-join').onclick = () => { if (codeInput.value.trim().length === 4) connect(codeInput.value.trim()); else codeInput.focus(); };
codeInput.onkeydown = nameInput.onkeydown = (e) => { if (e.key === 'Enter') (codeInput.value.trim().length === 4 ? $('h-join') : $('h-create')).click(); };
$('h-train').onclick = () => { $('h-train-pick').hidden = !$('h-train-pick').hidden; };
$('h-arenas').onclick = (e) => {
  const i = (e.target as HTMLElement).closest('button')?.dataset.i;
  if (i === undefined) return;
  screen(null);
  chips(null); $('h-scores').append(el('span', 'hint', TX.hud.trainingKeys));
  training = new TrainingPlay(view, hud, ARENAS[Number(i)], 0);
  show(training);
};
$('h-howto').onclick = () => {
  screen('s-howto');
  if (!demos.length) {
    stage.querySelectorAll<HTMLCanvasElement>('.card canvas').forEach((cv, i) => { const d = new Demo(cv, DEMOS[i]); views.push(d.view); demos.push(d); });
    refreshViews();
    void keyLabels().then((k) => { $('k-move').textContent = k.move; $('k-jump').textContent = k.jump; $('k-dash').textContent = k.dash; });
  }
  for (const d of demos) show(d);
};
$('w-back').onclick = () => home();

// ---- lobby ------------------------------------------------------------------------------------
function onRoom(m: RoomMsg) {
  const s = session!;
  room = m;
  if (location.pathname !== '/r/' + m.code) history.replaceState(null, '', '/r/' + m.code);
  if (m.phase !== 'lobby') { chips(s.results?.scores ?? s.round?.scores ?? null); return; }
  const me = m.players.find((p) => p.id === s.id), isHost = m.host === s.id;
  if ($('s-lobby').hidden) {
    screen('s-lobby');
    if (!sandbox) { const v = new View($<HTMLCanvasElement>('sandbox')); views.push(v); refreshViews(); sandbox = new Sandbox(v, ARENAS[m.arena], me?.color ?? 0); }
    show(sandbox);
    play = null; prevTicks = [];
  }
  sandbox!.set(ARENAS[m.arena], Math.max(0, me?.color ?? 0));
  $('l-code').textContent = m.code;
  $<HTMLInputElement>('l-link').value = `${location.origin}/r/${m.code}`;
  const list = $('l-players');
  list.textContent = '';
  for (const p of m.players) {
    const li = el('li', p.on ? '' : 'off');
    li.append(p.seat >= 0 ? swatch(p.color) : el('i'), el('span', 'nm', p.name));
    if (p.id === s.id) li.append(el('span', 'tag', TX.lobby.you));
    if (p.id === m.host) li.append(el('span', 'tag', TX.lobby.host));
    if (!p.on) li.append(el('span', 'tag', TX.lobby.away));
    else if (p.seat < 0) li.append(el('span', 'tag', TX.lobby.spectator));
    else if (p.ready || p.id === m.host) li.append(el('span', 'tag ok', TX.lobby.readyMark));
    list.append(li);
  }
  for (const b of $('l-colors').querySelectorAll('button')) {
    const i = Number(b.dataset.i), taken = m.players.some((p) => p.color === i && p.id !== s.id);
    b.disabled = taken || !me || me.seat < 0; b.classList.toggle('on', me?.color === i);
  }
  for (const b of $('l-arenas').querySelectorAll('button')) { b.classList.toggle('on', Number(b.dataset.i) === m.arena); b.disabled = !isHost; }
  const seated = m.players.filter((p) => p.seat >= 0 && p.on);
  $('l-rounds').textContent = m.rounds ? String(m.rounds) : `${TX.lobby.auto} (${AUTO_ROUNDS[Math.max(2, seated.length)]})`;
  $<HTMLButtonElement>('l-less').disabled = $<HTMLButtonElement>('l-more').disabled = $<HTMLButtonElement>('l-double').disabled = !isHost;
  $('l-double').textContent = m.double ? TX.settings.on : TX.settings.off; $('l-double').classList.toggle('on', m.double);
  const ready = $<HTMLButtonElement>('l-ready'), start = $<HTMLButtonElement>('l-start');
  ready.hidden = isHost || !me || me.seat < 0; ready.textContent = me?.ready ? TX.lobby.notReady : TX.lobby.ready; ready.classList.toggle('on', !!me?.ready);
  const enough = seated.length >= 2 && seated.filter((p) => p.ready || p.id === m.host).length >= 2;
  start.hidden = !isHost; start.disabled = !enough;
  $('l-note').textContent = me && me.seat < 0 ? TX.lobby.spectating : isHost ? (enough ? '' : TX.lobby.needTwo) : TX.lobby.waitHost;
  if (focusArena && isHost) { focusArena = false; $('l-arenas').querySelector('button')?.focus(); }
}
const set = (o: object) => session?.send({ t: 'set', ...o });
$('l-colors').onclick = (e) => { const i = (e.target as HTMLElement).closest('button')?.dataset.i; if (i !== undefined) set({ color: Number(i) }); };
$('l-arenas').onclick = (e) => { const i = (e.target as HTMLElement).closest('button')?.dataset.i; if (i !== undefined) set({ arena: Number(i) }); };
const stepRounds = (d: number) => { const r = room?.rounds ?? 0, n = r === 0 ? (d > 0 ? MIN_ROUNDS : MAX_ROUNDS) : r + d; set({ rounds: n < MIN_ROUNDS || n > MAX_ROUNDS ? 0 : n }); };
$('l-less').onclick = () => stepRounds(-1);
$('l-more').onclick = () => stepRounds(1);
$('l-double').onclick = () => set({ double: !room?.double });
$('l-ready').onclick = () => set({ ready: !room?.players.find((p) => p.id === session?.id)?.ready });
$('l-start').onclick = () => session?.send({ t: 'start' });
$('l-leave').onclick = () => leave();
$('l-copy').onclick = () => { void navigator.clipboard?.writeText($<HTMLInputElement>('l-link').value); $('l-copy').textContent = TX.lobby.copied; setTimeout(() => ($('l-copy').textContent = TX.lobby.copy), 1500); };

// ---- game -------------------------------------------------------------------------------------
function onRound(m: RoundMsg) {
  const s = session!;
  screen(null);
  $('results').hidden = true;
  if (!play) play = new OnlinePlay(view, hud, s);
  play.tips = prefs.tips;
  if (m.n === 1) prevTicks = [];
  chips(m.scores);
  show(play);
  play.onRound(m);
}

function onResults(m: ResultsMsg) {
  play?.onResults();
  chips(m.scores);
  const box = $('results'), table = el('table');
  box.textContent = '';
  box.append(el('h3', '', TX.results.title(m.n, m.kind)), table);
  m.rows.forEach((r, i) => {
    const tr = el('tr', r.seat === session?.seat ? 'me' : ''), prev = prevTicks[r.seat] ?? -1;
    const sw = el('td'); sw.append(swatch(colorOf(r.seat)));
    const delta = r.tick > 0 && prev > 0 ? r.tick - prev : null;
    tr.append(el('td', 'num', r.tick > 0 ? `${i + 1}.` : ''), sw, el('td', 'nm', nameOf(r.seat)), el('td', 'num', r.tick > 0 ? TX.results.time(r.tick) : TX.results.dnf),
      el('td', 'num ' + (delta === null ? '' : delta < 0 ? 'minus' : 'plus'), delta === null ? '' : TX.results.delta(delta)), el('td', 'num pts', TX.results.points(r.pts)), el('td', 'num', String(m.scores[r.seat])));
    table.append(tr);
  });
  for (const r of m.rows) prevTicks[r.seat] = r.tick;
  box.append(el('p', 'hint', m.next === 'podium' ? TX.results.nextPodium : m.next === 'tiebreak' ? TX.results.nextTie : TX.results.nextRound));
  box.hidden = false;
  audio.sfx('stamp');
}

function onPodium(m: PodiumMsg) {
  const s = session!;
  screen('s-podium');
  $('p-head').textContent = m.winners.length > 1 ? TX.podium.shared : TX.podium.winner(nameOf(m.winners[0]));
  const rank = $('p-rank'), awards = $('p-awards');
  rank.textContent = ''; awards.textContent = '';
  for (const seat of m.rank) {
    const li = el('li', m.winners.includes(seat) ? 'win' : '');
    li.append(swatch(colorOf(seat)), el('span', 'nm', nameOf(seat)), el('span', '', TX.podium.points(m.scores[seat])));
    rank.append(li);
  }
  for (const a of m.awards.slice(0, 4)) {
    const [title, text] = TX.award(a, nameOf(a.seat)), d = el('div', 'award');
    d.append(el('b', '', title), document.createTextNode(text));
    awards.append(d);
  }
  const host = s.isHost;
  for (const id of ['p-rematch', 'p-arena', 'p-lobby']) $<HTMLButtonElement>(id).disabled = !host;
  $('p-note').textContent = host ? `${TX.podium.rematch} : ${TX.podium.rematchHint}.` : TX.podium.waitHost;
  // The final ballet: the last round, every ghost, in a loop.
  const runs: Run[] = [];
  for (const row of s.runs) for (const r of row ?? []) if (r && r.len) runs.push(r);
  if (!balletView) { balletView = new View($<HTMLCanvasElement>('ballet')); views.push(balletView); refreshViews(); }
  ballet = new Replay(balletView, ARENAS[m.arena], runs.slice(-64), [0, 1, 2, 3].map(colorOf), m.rounds);
  show(ballet);
  audio.sfx('goal');
}
$('p-rematch').onclick = () => session?.send({ t: 'rematch' });
$('p-lobby').onclick = () => session?.send({ t: 'lobby' });
$('p-arena').onclick = () => { focusArena = true; session?.send({ t: 'lobby' }); };

// ---- settings ---------------------------------------------------------------------------------
function settings(open: boolean) {
  $('settings').hidden = !open;
  if (!open) return;
  $<HTMLInputElement>('o-vol').value = String(Math.round(prefs.vol * 100));
  $('o-shake').textContent = prefs.shake ? TX.settings.on : TX.settings.off; $('o-shake').classList.toggle('on', prefs.shake);
  $('o-tips').textContent = prefs.tips ? TX.settings.on : TX.settings.off; $('o-tips').classList.toggle('on', prefs.tips);
  $('o-quit').hidden = !session && !training;
  void keyLabels().then((k) => { $('o-keys').textContent = `${k.move} · ${k.jump} · ${k.dash}`; });
}
$('h-settings').onclick = () => settings(true);
$('o-close').onclick = () => settings(false);
$('o-quit').onclick = () => { settings(false); leave(); };
$<HTMLInputElement>('o-vol').oninput = (e) => { prefs.vol = Number((e.target as HTMLInputElement).value) / 100; audio.setVolume(prefs.vol); savePrefs(); };
$<HTMLInputElement>('o-vol').onchange = () => audio.sfx('jump');
$('o-shake').onclick = () => { prefs.shake = !prefs.shake; savePrefs(); refreshViews(); settings(true); };
$('o-tips').onclick = () => { prefs.tips = !prefs.tips; savePrefs(); if (play) play.tips = prefs.tips; settings(true); };
$('o-full').onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); };

// ---- keyboard, sound, automation ---------------------------------------------------------------
input.onEmote = (e) => { if (session && room && room.phase !== 'lobby') session.send({ t: 'emote', e }); };
input.onKey = (code) => {
  if (code === 'Escape') settings($('settings').hidden);
  else if (code === 'KeyR' && training) training.reset();
};
const unlock = () => { audio.unlock(); audio.setVolume(prefs.vol); };
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);
stage.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) audio.sfx('click'); });

// Test and bench hook: lets an automated browser read the state and script the inputs.
(window as any).__calque = { input, perf, get session() { return session; }, get play() { return play; } };

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
  stage.hidden = true; $('mobile').hidden = false; // touch only: a careful invitation to come back with a keyboard
} else if (new URLSearchParams(location.search).has('bench')) {
  screen(null);
  bench = new Bench(view);
  show(bench);
} else {
  screen('s-home');
  if (linkCode && nameInput.value.trim()) connect(linkCode); // a shared link and a known name: straight to the room
  else if (linkCode) nameInput.focus();
}
