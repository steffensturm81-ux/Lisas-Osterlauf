'use strict';

// Jogging seconds, recovery seconds, repetitions.
const plans = [
  [30, 90, 8], [30, 90, 8], [45, 90, 8], [60, 105, 8],
  [75, 105, 8], [90, 105, 8], [120, 120, 7], [150, 120, 6],
  [180, 120, 6], [240, 120, 5], [300, 120, 4], [420, 120, 3],
  [480, 120, 3], [600, 120, 2], [720, 120, 2], [900, 120, 2],
  [1200, 0, 1], [900, 0, 1]
];
const raceDay = Date.UTC(2027, 2, 27);
const dates = new Intl.DateTimeFormat('de-DE', {weekday:'short', day:'2-digit', month:'2-digit', timeZone:'UTC'});
const $ = id => document.getElementById(id);
const make = (tag, text) => Object.assign(document.createElement(tag), {textContent:text});
const storageKey = 'lisa-run-v1';
const getStored = key => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};
const store = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Continue in memory. */ }
};
let done = getStored(storageKey) || {};
if (typeof done !== 'object' || Array.isArray(done)) done = {};
$('sound').checked = getStored('lisa-run-sound') !== false;

const duration = s => s % 60 === 0 ? s / 60 + ' Min.' : s + ' Sek.';
const labels = {warm:'Aufwärmen · zügig gehen', run:'Locker joggen', walk:'Gehen', cool:'Locker ausgehen', race:'Osterlauf · 5 km'};
const sessions = plans.flatMap(([run, walk, repeats], week) =>
  [0, 2, 4].map((offset, day) => {
    const race = week === 17 && day === 2;
    const easyWalk = week === 17 && day === 1;
    const key = week === 17 ? ['17-0','17-2','17-1'][day] : week + '-' + day;
    const title = race ? 'Osterlauf · 5 km' : easyWalk ? '10 Min. locker gehen' : 'Training ' + (day + 1);
    const date = Date.UTC(2026, 10, 24 + week * 7 + offset);
    const sequence = [];
    if (race) sequence.push({kind:'race', seconds:null});
    else if (easyWalk) sequence.push({kind:'walk', seconds:600});
    else {
      sequence.push({kind:'warm', seconds:300});
      for (let i = 0; i < repeats; i++) {
        sequence.push({kind:'run', seconds:run});
        if (walk) sequence.push({kind:'walk', seconds:walk});
      }
      sequence.push({kind:'cool', seconds:240});
    }
    return {key, week, title, date, sequence};
  })
);
const nextSession = () => sessions.find(session => !done[session.key]);
const sessionName = session => 'Woche ' + (session.week + 1) + ' · ' + session.title;
const checkboxes = new Map();
let selected, index = 0, remaining = 0, deadline = 0, startedAt = 0;
let running = false, started = false, ticker, audio, lock, lockPending = false;

function mark(session, checked) {
  done[session.key] = checked;
  store(storageKey, done);
  updateProgress();
  if (!started && nextSession()) select(nextSession());
}

function updateProgress() {
  const total = sessions.filter(session => done[session.key]).length;
  $('progress').max = sessions.length;
  $('progress').value = total;
  $('progressText').textContent = total + ' von ' + sessions.length + ' Einheiten erledigt';
  $('nextSession').textContent = nextSession() ? sessionName(nextSession()) : 'Alle Einheiten abgeschlossen!';
  $('openTraining').textContent = running || started && current() ? 'Zum Lauf-Timer' : 'Zum Training';
  for (const [key, checkbox] of checkboxes) checkbox.checked = Boolean(done[key]);
}

for (const [week, [run, walk, repeats]] of plans.entries()) {
  const group = sessions.slice(week * 3, week * 3 + 3);
  const detail = document.createElement('details');
  detail.open = week === (nextSession()?.week ?? 17);
  const description = week === 17 ? '15 Min. locker joggen · 10 Min. locker gehen · 5 km Osterlauf' :
    walk ? repeats + ' × ' + duration(run) + ' joggen / ' + duration(walk) + ' gehen' :
    duration(run) + ' locker joggen, Gehpausen nach Bedarf';
  detail.append(make('summary', 'Woche ' + (week + 1) + ' · ' + dates.format(group[0].date)), make('p', description));
  for (const session of group) {
    const row = document.createElement('div');
    row.className = 'session-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.onchange = () => mark(session, checkbox.checked);
    checkboxes.set(session.key, checkbox);
    const label = make('label', dates.format(session.date) + ' · ' + session.title);
    label.prepend(checkbox);
    const button = make('button', 'Auswählen');
    button.setAttribute('aria-label', sessionName(session) + ' auswählen');
    button.onclick = () => {
      if (changeSession(session)) location.hash = 'training';
    };
    row.append(label, button);
    detail.append(row);
    $('session').add(new Option(sessionName(session), session.key));
  }
  $('weeks').append(detail);
}

function route() {
  const view = ['start','plan','training'].find(id => '#' + id === location.hash) || 'start';
  for (const id of ['start','plan','training']) $(id).hidden = id !== view;
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === '#' + view) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
const today = new Date();
const days = (raceDay - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000;
$('days').textContent = days > 0 ? days + (days === 1 ? ' Tag bis zum Start' : ' Tage bis zum Start') :
  days === 0 ? 'Heute ist Osterlauf!' : 'Osterlauf 2027';

function current() { return selected?.sequence[index]; }

function render() {
  const phase = current();
  const after = selected.sequence[index + 1];
  const race = phase?.kind === 'race';
  const seconds = Math.max(0, race ? Math.floor(remaining / 1000) : Math.ceil(remaining / 1000));
  const dial = $('dial');
  dial.style.setProperty('--fill', phase && !race ? Math.max(0, remaining / phase.seconds / 10) + '%' : '100%');
  dial.style.setProperty('--phase-color', phase?.kind === 'run' || race ? 'var(--lime)' : 'var(--orange)');
  dial.style.setProperty('--pace', phase?.kind === 'run' || race ? '.3s' : '.65s');
  dial.classList.toggle('moving', running);
  const phaseText = phase ? labels[phase.kind] : 'Geschafft!';
  if ($('phase').textContent !== phaseText) $('phase').textContent = phaseText;
  $('clock').textContent = String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
  $('step').textContent = phase ? (race ? 'Verstrichene Zeit' : 'Intervall ' + (index + 1) + ' von ' + selected.sequence.length) : 'Einheit gespeichert';
  $('upNext').textContent = after ? 'Danach · ' + labels[after.kind] + ' · ' + duration(after.seconds) :
    phase ? 'Danach · Trainingsende' : nextSession() ? 'Als Nächstes · ' + sessionName(nextSession()) : 'Trainingsplan abgeschlossen';
  $('toggle').textContent = phase ? running ? 'Pause' : started ? 'Fortsetzen' : 'Start' : nextSession() ? 'Nächste Einheit' : 'Erneut trainieren';
  $('skip').hidden = race;
  $('skip').disabled = !phase || !started;
  $('reset').textContent = race ? 'Osterlauf beenden' : 'Zurücksetzen';
  $('reset').disabled = race && !started;
}

function select(session) {
  stop();
  selected = session;
  $('session').value = session.key;
  index = 0;
  remaining = current().seconds * 1000;
  started = false;
  render();
}

function changeSession(session) {
  if (started && current() && !window.confirm('Laufendes Training verlassen? Der aktuelle Timer wird zurückgesetzt.')) {
    $('session').value = selected.key;
    return false;
  }
  select(session);
  return true;
}

function unlockAudio() {
  if (!$('sound').checked) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume().catch(() => {});
  } catch { /* Audio is optional. */ }
}

function announce(message) {
  if (!$('sound').checked) return;
  if (audio?.state === 'running') {
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(.14, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .18);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + .2);
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(message);
    speech.lang = 'de-DE';
    const voice = speechSynthesis.getVoices().find(candidate => candidate.lang === 'de-DE');
    if (voice) speech.voice = voice;
    speechSynthesis.speak(speech);
  }
}

async function keepAwake() {
  if (!running || lockPending || lock && !lock.released || document.hidden || !navigator.wakeLock) return;
  lockPending = true;
  try {
    const acquired = await navigator.wakeLock.request('screen');
    if (running && !document.hidden) lock = acquired;
    else await acquired.release();
  } catch { /* Browser policy or power mode can deny a wake lock. */ }
  finally { lockPending = false; }
}

function stop() {
  clearInterval(ticker);
  running = false;
  if (lock) void lock.release().catch(() => {});
  lock = null;
  window.speechSynthesis?.cancel();
}

function finish() {
  stop();
  index = selected.sequence.length;
  remaining = 0;
  mark(selected, true);
  announce('Geschafft. Deine Einheit ist gespeichert.');
  render();
}

function tick(now = Date.now()) {
  if (current().kind === 'race') {
    remaining = now - startedAt;
  } else {
    const previous = index;
    while (now >= deadline) {
      index++;
      if (!current()) { finish(); return; }
      deadline += current().seconds * 1000;
    }
    remaining = deadline - now;
    if (previous !== index) announce(labels[current().kind]);
  }
  render();
}

$('toggle').onclick = () => {
  if (!current()) { select(nextSession() || selected); return; }
  if (running) {
    tick();
    stop();
    render();
    return;
  }
  unlockAudio();
  const now = Date.now();
  startedAt = now - remaining;
  deadline = now + remaining;
  running = true;
  started = true;
  announce(labels[current().kind]);
  ticker = setInterval(tick, 125);
  void keepAwake();
  render();
};
$('skip').onclick = () => {
  index++;
  if (!current()) { finish(); return; }
  remaining = current().seconds * 1000;
  deadline = Date.now() + remaining;
  if (running) announce(labels[current().kind]);
  render();
};
$('reset').onclick = () => {
  if (current()?.kind === 'race') finish();
  else select(selected);
};
$('session').onchange = event => changeSession(sessions.find(session => session.key === event.target.value));
$('openTraining').onclick = () => {
  if ((!started || !current()) && nextSession()) select(nextSession());
};
$('sound').onchange = () => {
  store('lisa-run-sound', $('sound').checked);
  if ($('sound').checked) unlockAudio();
  else window.speechSynthesis?.cancel();
};
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && running) {
    tick();
    void keepAwake();
  }
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  const progress = getStored(storageKey);
  done = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  updateProgress();
  if (!started && nextSession()) select(nextSession());
});
select(nextSession() || sessions[0]);
updateProgress();
route();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline-Modus:', error));
}
