// The workbench page.
//
// Everything happens in this browser. The page's CSP has no connect-src, so it cannot send
// a class's contact details anywhere even if a later edit tried to; the only way data
// leaves is a file the delegate downloads themselves.
//
// The list is built with createElement and textContent throughout, never innerHTML. Names
// and addresses here arrived in a URL a parent sent through WhatsApp, which is to say from
// outside. The CSP would already stop an injected script, but a rendering path that cannot
// interpret its input as markup needs no such argument.
//
// Identifiers and comments are English; everything a delegate reads is German.

import {
  newProject, ingestSubmission, caregiversForChild, deleteCaregiver, setConsent,
  projectToJson, projectFromJson, UNKNOWN, CONSENT_LABEL,
} from '../core/model.js';
import { parseClassName, compareClasses } from '../core/classname.js';
import { normalizeName } from '../core/names.js';
import { readableSummary } from '../core/payload.js';
import { submissionFromHash, sameClass, slugFor, previewIngest } from './intake.js';
import {
  counters, consentLabel, consentState, nextConsent, outcomeText, mismatchText,
  contactLine, addressLine, personName, projectFileName, savedText, fileSummary,
  NOT_SAVED, SAVING,
} from './format.js';
import * as store from './storage.js';

// ---------------------------------------------------------------- the payload, first

/**
 * Take the submission out of the URL, and out of the browser's history, in one step.
 *
 * A fragment left in place comes back with the back button. On a shared family laptop that
 * is another family's phone number sitting in a history other people can open. It is the
 * easiest step to lose when this file is next rewritten, which is why it is at the top and
 * not tucked inside the intake handler: nothing can be inserted before it by accident.
 */
function takeHash() {
  const found = submissionFromHash(location.hash);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  return found;
}

const arriving = takeHash();

/**
 * The same link again, arriving without a page load.
 *
 * Tapping `/w/#d=…` while the workbench is already open in that tab is a *same-document*
 * navigation: the browser changes the fragment and fires hashchange, and does not re-run
 * this module. Without this listener that is the common case in real use — a delegate with
 * the tool open in a tab — and the page would sit there doing nothing while the payload
 * stayed in the address bar. replaceState does not fire hashchange, so this cannot loop.
 */
window.addEventListener('hashchange', () => {
  const found = takeHash();
  if (found) handleArriving(found);
});

// ---------------------------------------------------------------- context and helpers

const $ = (id) => document.getElementById(id);

const meta = (name, fallback = '') =>
  document.querySelector(`meta[name="kk-${name}"]`)?.content || fallback;

const CONTEXT = {
  schoolYear: meta('year'),
  school: meta('school'),
  noticeVersion: meta('notice'),
  baseUrl: meta('base'),
  // `Klasse 3a:22|Klasse 3b:21|…`, written by the build from site.config.json.
  classes: meta('classes').split('|').filter(Boolean)
    .map((entry) => {
      const [name, count] = entry.split(':');
      return { name, count: Number(count) || 0, parsed: parseClassName(name) };
    })
    .filter((c) => c.parsed.ok)
    .sort((a, b) => compareClasses(a.parsed, b.parsed)),
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * Today, in local time rather than UTC.
 *
 * `toISOString().slice(0, 10)` is one line shorter and wrong for two hours every night:
 * a consent recorded at 23:30 in Zürich would be dated tomorrow. That date is the answer
 * to "when did she say no", so it should say what the delegate's clock said.
 */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function drawList(ul, items) {
  ul.textContent = '';
  for (const item of items) ul.append(el('li', '', item));
  ul.classList.toggle('hidden', items.length === 0);
}

// ---------------------------------------------------------------- state

let project = null;      // the open project, or null on first run
let slug = '';
let records = [];        // every project in this browser, for the switcher
let pending = null;      // a decoded submission waiting for the delegate's decision
let storageOk = true;
let saveTimer = null;

const SCREENS = ['screen-setup', 'screen-intake', 'screen-main', 'screen-manual', 'screen-confirm'];

function show(id) {
  for (const screen of SCREENS) $(screen).classList.toggle('hidden', screen !== id);
  window.scrollTo({ top: 0 });
}

function message(text, tone = '') {
  const box = $('message');
  box.textContent = text || '';
  box.className = `message${tone ? ` ${tone}` : ''}${text ? '' : ' hidden'}`;
}

const listRecords = async () => {
  if (!storageOk) return [];
  try { return await store.listRecords(); } catch { return []; }
};

// ---------------------------------------------------------------- saving

function setSaveState(text, unsaved = false) {
  const state = $('save-state');
  state.textContent = text;
  state.classList.toggle('unsaved', unsaved);
}

/** Something changed. Autosave shortly; delegates must not lose work by forgetting to save. */
function touch() {
  if (!project) return;
  setSaveState(NOT_SAVED, true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!project || !storageOk) return;
  setSaveState(SAVING, true);
  const at = new Date();
  try {
    await store.writeRecord(slug, project, at.toISOString());
    setSaveState(savedText(at));
  } catch {
    setSaveState(NOT_SAVED, true);
    message('Das Speichern hat nicht geklappt. Bitte laden Sie die Projektdatei herunter.', 'warn');
  }
}

// A delegate who closes the tab within half a second of the last change must not lose it.
// visibilitychange is the hook that actually fires when a phone browser is put away;
// beforeunload frequently does not.
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flush(); });
window.addEventListener('beforeunload', () => { if (saveTimer) flush(); });

// ---------------------------------------------------------------- one confirmation screen

let confirmResolve = null;

/**
 * @param {{title: string, body: string, yes: string,
 *          typed?: {label: string, expected: string}}} options
 *   `typed` makes the delegate write something out before the button works. Used where a
 *   mis-tap is not recoverable.
 * @returns {Promise<boolean>}
 */
function ask({ title, body, yes, typed = null }) {
  $('confirm-title').textContent = title;
  $('confirm-body').textContent = body;
  $('confirm-yes').textContent = yes;
  $('confirm-yes').disabled = !!typed;

  const input = $('confirm-typed-input');
  input.value = '';
  $('confirm-typed').classList.toggle('hidden', !typed);
  if (typed) {
    $('confirm-typed-label').textContent = typed.label;
    const wanted = typed.expected.trim().toLowerCase();
    input.oninput = () => {
      $('confirm-yes').disabled = input.value.trim().toLowerCase() !== wanted;
    };
  } else {
    input.oninput = null;
  }

  show('screen-confirm');
  (typed ? input : $('confirm-yes')).focus();
  return new Promise((resolve) => { confirmResolve = resolve; });
}

const answer = (value) => {
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve?.(value);
};
$('confirm-yes').addEventListener('click', () => answer(true));
$('confirm-no').addEventListener('click', () => answer(false));

// ---------------------------------------------------------------- the header

function drawHead() {
  $('head').classList.toggle('hidden', !project);
  if (!project) return;
  $('head-class').textContent = project.classLabel;
  $('head-year').textContent = project.schoolYear;
  document.title = `${project.classLabel} — Werkstatt`;
}

/**
 * Which copy of the tool this is.
 *
 * The offline single-file build runs under `file://`, a different origin, and therefore a
 * different IndexedDB. Two datasets, one tool, and no hint of it unless the page says so —
 * which surfaces weeks later as "my families are gone". Permanent rather than dismissible
 * for that reason.
 */
function drawOrigin() {
  const offline = location.protocol === 'file:';
  const origin = $('origin');
  origin.textContent = offline
    ? 'Offline-Datei. Was Sie hier erfassen, ist von der Online-Version getrennt — jede '
      + 'hat ihren eigenen Speicher. Die Projektdatei ist die Brücke zwischen beiden.'
    : `Online-Version (${location.host}).`;
  origin.className = `origin${offline ? ' offline' : ''}`;
}

// ---------------------------------------------------------------- the dataset

function drawCounters() {
  const box = $('counters');
  box.textContent = '';
  const known = CONTEXT.classes.find((c) => sameClass(c.name, project.classLabel));
  for (const counter of counters(project, known?.count || 0)) {
    box.append(el('span', `counter${counter.tone === 'warn' ? ' warn' : ''}`, counter.text));
  }
}

function consentPill(person, field) {
  const value = person.consent[field];
  const button = el('button', `pill ${consentState(value)}`);
  button.type = 'button';
  button.dataset.action = 'consent';
  button.dataset.caregiver = person.id;
  button.dataset.consent = field;
  // Trailing space, not only a CSS margin: a screen reader announces textContent, and
  // "Klassenlisteja" is not a sentence.
  button.append(el('span', 'pill-label', `${CONSENT_LABEL[field]}: `));
  button.append(el('span', 'pill-value', consentLabel(value)));
  button.title = `Ändern auf «${consentLabel(nextConsent(value))}»`;
  return button;
}

function personBlock(person) {
  const block = el('div', 'person');
  block.append(el('div', 'person-name', personName(person)));
  const contact = contactLine(person);
  if (contact) block.append(el('div', 'person-line', contact));
  const address = addressLine(person);
  if (address) block.append(el('div', 'person-line', address));

  const row = el('div', 'consents');
  row.append(consentPill(person, 'classList'));
  row.append(consentPill(person, 'whatsappGroup'));
  const remove = el('button', 'remove', 'Löschen');
  remove.type = 'button';
  remove.dataset.action = 'remove';
  remove.dataset.caregiver = person.id;
  row.append(remove);
  block.append(row);
  return block;
}

/** Grouped by child, because that is the grouping key of every output this feeds. */
function drawFamilies() {
  const list = $('families');
  list.textContent = '';

  if (!project.children.length) {
    list.append(el('p', 'hint', 'Noch keine Angaben. Die Anleitung oben erklärt, wie Sie '
      + 'eine Nachricht der Eltern übernehmen.'));
    return;
  }

  const children = [...project.children]
    .sort((a, b) => personName(a).localeCompare(personName(b), 'de'));

  for (const child of children) {
    const people = caregiversForChild(project, child.id);
    const card = el('div', `family${people.length ? '' : ' orphan'}`);
    card.append(el('p', 'child-name', personName(child)));
    if (!people.length) {
      card.append(el('p', 'child-note', 'Niemand erfasst — bitte bei der Klasse nachfragen.'));
    }
    for (const person of people) card.append(personBlock(person));
    list.append(card);
  }
}

function drawMain() {
  drawHead();
  drawCounters();
  drawFamilies();
  // Open the instructions while there is nothing to look at, closed once the delegate is
  // under way. With an empty list the only thing that redraws is adding the first family,
  // which closes it anyway, so this never fights a delegate who shut it deliberately.
  $('how').open = project.children.length === 0;
}

$('families').addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || !project) return;
  const person = project.caregivers.find((c) => c.id === target.dataset.caregiver);
  if (!person) return;

  if (target.dataset.action === 'consent') {
    const field = target.dataset.consent;
    if (setConsent(project, person.id, field, nextConsent(person.consent[field]), today())) {
      touch();
      // Swap this one pill rather than redrawing the list, so the next tap lands on the
      // same spot: cycling unbekannt → ja → nein is two taps and should not need re-aiming.
      const fresh = consentPill(person, field);
      target.replaceWith(fresh);
      fresh.focus();
      drawCounters();
    }
    return;
  }

  if (target.dataset.action === 'remove') {
    const yes = await ask({
      title: 'Person löschen?',
      body: `${personName(person)} wird aus diesem Projekt entfernt. Kinder, an denen `
        + 'danach niemand mehr hängt, verschwinden mit.',
      yes: 'Löschen',
    });
    if (yes) {
      deleteCaregiver(project, person.id, today());
      touch();
      drawMain();
    }
    show('screen-main');
  }
});

// ---------------------------------------------------------------- opening and creating

async function openProject(target) {
  let record = null;
  try { record = await store.readRecord(target); } catch { record = null; }
  if (!record) return false;

  project = record.project;
  slug = target;
  try { await store.markOpened(slug, new Date().toISOString()); } catch { /* not fatal */ }
  records = await listRecords();
  setSaveState(record.savedAt ? savedText(new Date(record.savedAt)) : '');
  drawMain();
  return true;
}

async function createProject(classLabel, delegates) {
  const parsed = parseClassName(classLabel);
  if (!parsed.ok) {
    message(`«${classLabel}» ist kein lesbarer Klassenname.`, 'warn');
    return false;
  }
  if (records.some((r) => r.slug === parsed.slug)) {
    const yes = await ask({
      title: 'Diese Klasse ist schon angelegt',
      body: `Für ${parsed.display} liegen in diesem Browser bereits Angaben: `
        + `${fileSummary(records.find((r) => r.slug === parsed.slug).project)}. `
        + 'Neu anlegen löscht sie.',
      yes: 'Trotzdem neu anlegen',
    });
    if (!yes) return false;
  }

  project = newProject({
    classLabel: parsed.display,
    schoolYear: CONTEXT.schoolYear,
    delegates: delegates || '',
    now: today(),
  });
  slug = parsed.slug;
  await flush();
  try { await store.markOpened(slug, new Date().toISOString()); } catch { /* not fatal */ }
  records = await listRecords();
  drawMain();
  return true;
}

function drawSetup() {
  const select = $('setup-class');
  if (!select.options.length) {
    for (const c of CONTEXT.classes) {
      const option = document.createElement('option');
      option.value = c.parsed.display;
      option.textContent = c.parsed.display;
      select.append(option);
    }
  }

  const list = $('projects-list');
  list.textContent = '';
  $('projects').classList.toggle('hidden', records.length === 0);
  for (const record of store.byMostRecentlyOpened(records)) {
    const row = el('div', 'project-row');
    const text = el('div', 'project-row-text');
    text.append(el('strong', '', record.project.classLabel || record.slug));
    text.append(el('span', '', fileSummary(record.project)));
    row.append(text);
    const open = el('button', 'open', record.slug === slug ? 'Offen' : 'Öffnen');
    open.type = 'button';
    open.dataset.slug = record.slug;
    row.append(open);
    list.append(row);
  }
}

$('projects-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-slug]');
  if (!button) return;
  if (await openProject(button.dataset.slug)) {
    if (pending) showPending();
    else show('screen-main');
  }
});

$('setup-create').addEventListener('click', async () => {
  const created = await createProject($('setup-class').value, $('setup-delegates').value.trim());
  if (!created) { drawSetup(); show('screen-setup'); return; }
  $('setup-delegates').value = '';
  if (pending) showPending();
  else show('screen-main');
});

$('head-switch').addEventListener('click', () => { drawSetup(); show('screen-setup'); });

// ---------------------------------------------------------------- taking a submission in

const INTAKE_BUTTONS = ['intake-accept', 'intake-switch', 'intake-create', 'intake-manual',
  'intake-discard'];

function showIntake({ title, error = '', review = false, outcome = false, buttons,
  discardLabel = 'Verwerfen' }) {
  $('intake-title').textContent = title;
  $('intake-error').textContent = error;
  $('intake-error').classList.toggle('hidden', !error);
  $('intake-review').classList.toggle('hidden', !review);
  $('intake-outcome').classList.toggle('hidden', !outcome);
  // Only where there is something to accept: on a mismatch or a broken link there is
  // nothing to confirm, and "nothing is saved yet" answers a question nobody asked.
  $('intake-hint').classList.toggle('hidden', !outcome);
  if (!outcome) $('intake-notes-box').classList.add('hidden');
  for (const id of INTAKE_BUTTONS) $(id).classList.toggle('hidden', !buttons.includes(id));
  $('intake-discard').textContent = discardLabel;
  show('screen-intake');
}

/** One entry point for a submission, whether the page just loaded or the hash just changed. */
function handleArriving(found) {
  if (!found.ok) {
    pending = null;
    showIntake({
      title: 'Dieser Link lässt sich nicht lesen',
      error: `${found.text} Der lesbare Teil der Nachricht steht darüber — Sie können die `
        + 'Angaben von Hand eintippen.',
      buttons: project ? ['intake-manual', 'intake-discard'] : ['intake-discard'],
      discardLabel: project ? 'Weiter zur Liste' : 'Weiter',
    });
    return;
  }
  pending = found.submission;
  showPending();
}

function afterIntake() {
  message('');
  if (project) { drawMain(); show('screen-main'); } else { drawSetup(); show('screen-setup'); }
}

/**
 * Show what taking the pending submission in would do, and wait for a decision.
 *
 * Nothing is stored here. The dataset changes only in the accept handler, and only after
 * the delegate has read the same words the parent sent.
 */
function showPending() {
  $('intake-readable').textContent = readableSummary(pending);
  const incoming = parseClassName(pending.classLabel);

  // The link names a class nobody can read. Rather than a dead end, offer the open project
  // and say plainly where the details would land.
  if (!incoming.ok) {
    if (!project) {
      showIntake({
        title: 'Erst eine Klasse anlegen',
        error: 'Der Link nennt keine lesbare Klasse. Legen Sie unten eine Klasse an oder '
          + 'öffnen Sie eine — danach lässt sich der Link übernehmen.',
        review: true,
        buttons: ['intake-discard'],
        discardLabel: 'Zur Klassenauswahl',
      });
      return;
    }
    showIntake({
      title: 'Angaben übernehmen?',
      error: `Der Link nennt keine lesbare Klasse. Die Angaben kommen zu ${project.classLabel}.`,
      review: true,
      outcome: true,
      buttons: ['intake-accept', 'intake-discard'],
    });
    fillOutcome();
    return;
  }

  // A different class than the one that is open. Never silent: a delegate can hold two
  // classes, and a family filed under the wrong one is invisible from then on.
  if (!project || !sameClass(project.classLabel, pending.classLabel)) {
    const existing = records.find((r) => sameClass(r.project.classLabel, pending.classLabel));
    showIntake({
      title: 'Andere Klasse',
      error: mismatchText(incoming.display, project?.classLabel),
      review: true,
      buttons: [existing ? 'intake-switch' : 'intake-create', 'intake-discard'],
    });
    return;
  }

  showIntake({
    title: 'Angaben übernehmen?',
    review: true,
    outcome: true,
    buttons: ['intake-accept', 'intake-discard'],
  });
  fillOutcome();
}

function fillOutcome() {
  const preview = previewIngest(project, pending, today());
  $('intake-outcome-text').textContent = outcomeText(preview);
  drawList($('intake-changes'), preview.changes);
  drawList($('intake-notes'), preview.notes.map((n) => n.text));
  $('intake-notes-box').classList.toggle('hidden', preview.notes.length === 0);
}

$('intake-accept').addEventListener('click', () => {
  const submission = pending;
  pending = null;
  const result = ingestSubmission(project, submission, { now: today() });
  touch();
  afterIntake();
  // Notes are repeated here on purpose: an unreadable number is the delegate's job to chase
  // and it must not disappear with the screen that mentioned it.
  const notes = result.notes.map((n) => n.text).join(' · ');
  message(notes ? `Übernommen. Bitte anschauen: ${notes}` : 'Übernommen.',
    notes ? 'warn' : 'ok');
});

$('intake-switch').addEventListener('click', async () => {
  const record = records.find((r) => sameClass(r.project.classLabel, pending.classLabel));
  if (record && await openProject(record.slug)) showPending();
});

$('intake-create').addEventListener('click', async () => {
  const parsed = parseClassName(pending.classLabel);
  if (parsed.ok && await createProject(parsed.display, '')) showPending();
});

$('intake-manual').addEventListener('click', () => { pending = null; openManual(); });

$('intake-discard').addEventListener('click', () => { pending = null; afterIntake(); });

// ---------------------------------------------------------------- typing in a paper form

let typedThisSitting = 0;

function openManual() {
  if (!project) { drawSetup(); show('screen-setup'); return; }
  typedThisSitting = 0;
  $('manual-done').classList.add('hidden');
  $('manual-error').classList.add('hidden');
  resetManualForm();
  show('screen-manual');
  $('manual-child-first-name').focus();
}

$('add-by-hand').addEventListener('click', openManual);
$('manual-back').addEventListener('click', () => { drawMain(); show('screen-main'); });

for (const button of document.querySelectorAll('#screen-manual [data-address-toggle]')) {
  button.addEventListener('click', () => {
    button.nextElementSibling.classList.remove('hidden');
    button.classList.add('hidden');
    button.nextElementSibling.querySelector('input')?.focus();
  });
}

$('manual-second-toggle').addEventListener('click', () => {
  $('manual-second').classList.remove('hidden');
  $('manual-second-toggle').classList.add('hidden');
  $('manual-second').querySelector('input')?.focus();
});

function resetManualForm() {
  $('manual-form').reset();
  $('manual-second').classList.add('hidden');
  $('manual-second-toggle').classList.remove('hidden');
  for (const box of document.querySelectorAll('#screen-manual [data-address]')) {
    box.classList.add('hidden');
  }
  for (const button of document.querySelectorAll('#screen-manual [data-address-toggle]')) {
    button.classList.remove('hidden');
  }
}

// Tidy names as the delegate leaves each field. The model normalises on ingest anyway, so
// this changes no stored value — but a delegate typing twenty slips should see the list
// they are building, not their own shift key.
for (const field of document.querySelectorAll('#screen-manual [data-role="firstName"], '
  + '#screen-manual [data-role="lastName"], #screen-manual [data-role="street"], '
  + '#screen-manual [data-role="town"], #manual-child-first-name, #manual-child-last-name')) {
  field.addEventListener('blur', () => { field.value = normalizeName(field.value); });
}

function readCaregiverFields(root) {
  const value = (role) => root.querySelector(`[data-role="${role}"]`)?.value.trim() || '';
  const caregiver = {
    firstName: value('firstName'), lastName: value('lastName'), role: value('role'),
    email: value('email'), mobile: value('mobile'),
  };
  const address = { street: value('street'), postcode: value('postcode'), town: value('town') };
  if (address.street || address.postcode || address.town) caregiver.address = address;
  const anything = caregiver.firstName || caregiver.lastName || caregiver.email || caregiver.mobile;
  return anything ? caregiver : null;
}

// A box left blank on paper is not a refusal. `null` here reaches the model as UNKNOWN and
// keeps the family out of every shared list until somebody actually asks them.
const TRI = { yes: true, no: false, unknown: UNKNOWN };
const readConsent = (name) =>
  TRI[document.querySelector(`input[name="${name}"]:checked`)?.value || 'unknown'];

function manualError(text) {
  const box = $('manual-error');
  box.textContent = text;
  box.classList.remove('hidden');
}

/**
 * Enter saves and clears, because a delegate at a kitchen table types twenty slips in a
 * row. A form submit is what Enter in a text field already does, so this needs no key
 * handling of its own — and `form-action 'none'` in the CSP means a missed preventDefault
 * cannot turn into a request.
 */
$('manual-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!project) return;

  const child = {
    firstName: $('manual-child-first-name').value.trim(),
    lastName: $('manual-child-last-name').value.trim(),
  };
  const second = $('manual-second');
  const caregivers = [
    readCaregiverFields(document.querySelector('#screen-manual [data-caregiver="1"]')),
    second.classList.contains('hidden') ? null : readCaregiverFields(second),
  ].filter(Boolean);

  if (!child.firstName) return manualError('Bitte den Vornamen des Kindes angeben.');
  if (!caregivers.length) return manualError('Bitte mindestens eine Bezugsperson angeben.');
  $('manual-error').classList.add('hidden');

  const result = ingestSubmission(project, {
    classLabel: project.classLabel,
    schoolYear: project.schoolYear,
    noticeVersion: CONTEXT.noticeVersion,
    date: today(),
    source: 'paper',
    children: [child],
    caregivers,
    consent: {
      classList: readConsent('consent-class-list'),
      whatsappGroup: readConsent('consent-whatsapp-group'),
    },
  }, { now: today() });

  touch();
  typedThisSitting += 1;

  const remarks = result.notes.map((n) => n.text);
  if (!caregivers.some((c) => c.email || c.mobile)) {
    remarks.push('Ohne E-Mail und ohne Nummer erfasst — so ist diese Familie nicht erreichbar.');
  }
  // The stored child, not the typed one, so the receipt shows "Noah Weber" where the
  // delegate typed "noah weber" — same reason the parent form tidies names on blur.
  const stored = project.children.find((c) => c.id === result.children[0]) || child;
  const done = $('manual-done');
  done.textContent = [
    `${personName(stored)} erfasst (${typedThisSitting} in dieser Sitzung).`,
    ...remarks,
  ].join(' · ');
  done.className = `message ${remarks.length ? 'warn' : 'ok'}`;

  resetManualForm();
  $('manual-child-first-name').focus();
});

// ---------------------------------------------------------------- the project file

$('download-file').addEventListener('click', async () => {
  await flush();
  const blob = new Blob([projectToJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = projectFileName(slug, today());
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked a beat later: revoking in the same turn cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  message(`${link.download} wurde heruntergeladen. Diese Datei ist Ihre Sicherung.`, 'ok');
});

$('upload-file').addEventListener('click', () => $('main-file').click());
for (const input of [$('main-file'), $('setup-file')]) {
  input.addEventListener('change', (event) => loadFile(event.target, event.target.files[0]));
}

/**
 * Load a project file over what is here.
 *
 * v1 replaces and does not merge. Merging two datasets is its own problem — which side
 * wins a differing number, what happens to a consent recorded in both — and nobody needs
 * it in the first year. Replacing is easy to explain, so the confirmation can state the
 * counts on both sides and let the delegate see which file they picked.
 */
async function loadFile(input, file) {
  input.value = '';                       // so picking the same file twice fires again
  if (!file) return;

  let text;
  try { text = await file.text(); } catch { message('Die Datei liess sich nicht lesen.', 'warn'); return; }

  const parsed = projectFromJson(text);
  if (!parsed.ok) { message(parsed.text, 'warn'); return; }

  const incoming = parsed.project;
  const target = slugFor(incoming.classLabel);
  if (!target) { message('In der Datei steht keine lesbare Klasse.', 'warn'); return; }

  const replacing = records.find((r) => r.slug === target);
  const yes = await ask({
    title: replacing ? 'Laden und ersetzen?' : 'Datei laden?',
    body: replacing
      ? `Die Datei enthält: ${fileSummary(incoming)}.\n\nSie ersetzt, was hier liegt: `
        + `${fileSummary(replacing.project)}.`
      : `Die Datei enthält: ${fileSummary(incoming)}.`,
    yes: replacing ? 'Ersetzen' : 'Laden',
  });
  if (!yes) { afterIntake(); return; }

  project = incoming;
  slug = target;
  await flush();
  try { await store.markOpened(slug, new Date().toISOString()); } catch { /* not fatal */ }
  records = await listRecords();
  drawMain();
  show('screen-main');
  message('Projektdatei geladen.', 'ok');
}

$('wipe').addEventListener('click', async () => {
  const label = project.classLabel;
  const yes = await ask({
    title: 'Alles löschen?',
    body: `Alle Angaben von ${label} werden aus diesem Browser entfernt. Eine bereits `
      + 'heruntergeladene Projektdatei bleibt bestehen — ohne sie ist das nicht rückgängig '
      + 'zu machen.',
    yes: 'Endgültig löschen',
    typed: { label: `Zum Bestätigen «${label}» eintippen`, expected: label },
  });
  if (!yes) { show('screen-main'); return; }

  // Cancel the pending autosave first, or it fires straight after the delete and writes the
  // project back in.
  clearTimeout(saveTimer);
  saveTimer = null;
  const dying = slug;
  project = null;
  slug = '';
  try { await store.removeRecord(dying); } catch { /* nothing left to do about it */ }

  records = await listRecords();
  drawHead();
  setSaveState('');
  drawSetup();
  show('screen-setup');
  message(`Alle Angaben von ${label} wurden gelöscht.`);
});

// ---------------------------------------------------------------- start

async function boot() {
  drawOrigin();
  $('foot-school').textContent = CONTEXT.school;

  const state = await store.ready();
  storageOk = state.ok;
  if (!state.ok) message(state.text, 'warn');

  records = await listRecords();
  const last = store.byMostRecentlyOpened(records)[0];
  if (last) await openProject(last.slug);

  if (arriving) { handleArriving(arriving); return; }

  if (project) { drawMain(); show('screen-main'); } else { drawSetup(); show('screen-setup'); }
}

boot();
