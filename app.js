const globe = Globe()
  (document.getElementById('globe-container'))
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .backgroundColor('rgba(0,0,0,0)')
  .width(460)
  .height(460)
  .pointOfView({ altitude: 2.2 });

const menuBtn = document.getElementById('menu-btn');
const closeBtn = document.getElementById('close-btn');
const sideMenu = document.getElementById('side-menu');
const overlay = document.getElementById('overlay');

menuBtn.addEventListener('click', () => {
  sideMenu.classList.add('open');
  overlay.classList.add('active');
});

closeBtn.addEventListener('click', () => {
  sideMenu.classList.remove('open');
  overlay.classList.remove('active');
});

overlay.addEventListener('click', () => {
  sideMenu.classList.remove('open');
  overlay.classList.remove('active');
});

const navItems = {
  'nav-home': 'view-home',
  'nav-visited': 'view-visited',
  'nav-tovisit': 'view-tovisit',
  'nav-entries': 'view-entries',
  'nav-people': 'view-people',
};

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

Object.keys(navItems).forEach(navId => {
  document.getElementById(navId).addEventListener('click', () => {
    showView(navItems[navId]);
    if (navId === 'nav-visited') renderVisitedList();
    sideMenu.classList.remove('open');
    overlay.classList.remove('active');
  });
});

const { collection, addDoc, getDocs, doc, setDoc, updateDoc, serverTimestamp } = window.firestoreFns;
const db = window.db;

// crude centroid: average of the outer-ring coordinates.
// for MultiPolygon countries, use the ring with the most points (main landmass)
function computeCentroid(feature) {
  const geom = feature.geometry;
  let ring;
  if (geom.type === 'Polygon') {
    ring = geom.coordinates[0];
  } else if (geom.type === 'MultiPolygon') {
    ring = geom.coordinates[0][0];
    geom.coordinates.forEach(poly => {
      if (poly[0].length > ring.length) ring = poly[0];
    });
  } else {
    return { lat: 0, lng: 0 };
  }
  let lngSum = 0, latSum = 0;
  ring.forEach(([lng, lat]) => { lngSum += lng; latSum += lat; });
  return { lat: latSum / ring.length, lng: lngSum / ring.length };
}

// --- custom, readable document IDs ---
function slugify(str) {
  return (str || 'unknown')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateEntryId(prefix, country) {
  const now = new Date();
  const stamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 5); // guards against same-second collisions
  return `${prefix}-${slugify(country)}-${stamp}-${rand}`;
}

// --- journal entries ---
async function saveJournalEntry({ id, country, title, date, content }) {
  if (id) {
    await updateDoc(doc(db, "journalEntries", id), {
      title, date, content, country,
      updatedAt: serverTimestamp()
    });
    return id;
  } else {
    const newId = generateEntryId('j', country);
    await setDoc(doc(db, "journalEntries", newId), {
      title, date, content, country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return newId;
  }
}

// --- people entries ---
async function savePersonEntry({ id, country, name, from, metWhere, instagram, whatsapp, note }) {
  if (id) {
    await updateDoc(doc(db, "people", id), {
      name, from, metWhere, instagram, whatsapp, note, country,
      updatedAt: serverTimestamp()
    });
    return id;
  } else {
    const newId = generateEntryId('p', country);
    await setDoc(doc(db, "people", newId), {
      name, from, metWhere, instagram, whatsapp, note, country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return newId;
  }
}

// --- sticky notes ---
async function saveNoteEntry({ id, country, content }) {
  if (id) {
    await updateDoc(doc(db, "notes", id), {
      content, country,
      updatedAt: serverTimestamp()
    });
    return id;
  } else {
    const newId = generateEntryId('n', country);
    await setDoc(doc(db, "notes", newId), {
      content, country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return newId;
  }
}

// --- visited countries: manual only, via "Plant Pin". Doc IDs prefixed "visited-" ---
let countryCentroids = {};
let visitedCountries = new Set();
let visitedPinsData = []; // [{ country, lat, lng }]

async function fetchCollectionDocs(name) {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function plantPin(country) {
  const coords = countryCentroids[country] || { lat: 0, lng: 0 };
  const id = `visited-${slugify(country)}`; // e.g. visited-nepal — one doc per country, re-planting just overwrites
  await setDoc(doc(db, "visitedCountries", id), {
    country,
    lat: coords.lat,
    lng: coords.lng,
    createdAt: serverTimestamp()
  });
}

async function computeVisitedData() {
  const docs = await fetchCollectionDocs('visitedCountries');
  return {
    visited: new Set(docs.map(d => d.country)),
    pins: docs.map(d => ({ country: d.country, lat: d.lat, lng: d.lng }))
  };
}

async function refreshVisitedData() {
  const data = await computeVisitedData();
  visitedCountries = data.visited;
  visitedPinsData = data.pins;
  globe.htmlElementsData(visitedPinsData);
  renderVisitedList();
}

// small red pin icon — tip points down at the actual coordinate
const pinSvg = `
<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 19 11 19s11-10.75 11-19C22 4.925 17.075 0 11 0z" fill="#c0392b" stroke="#2e2a26" stroke-width="0.8"/>
  <circle cx="11" cy="11" r="4.2" fill="#f4efe6"/>
</svg>`;

function makePinElement(d) {
  const el = document.createElement('div');
  el.innerHTML = pinSvg;
  el.style.width = '22px';
  el.style.cursor = 'pointer';
  el.style.pointerEvents = 'auto';
  el.style.transform = 'translate(-50%, -100%)'; // anchor the pin's tip to the coordinate
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openPinPopup(d.country);
  });
  return el;
}

async function loadCountries() {
  const geoRes = await fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson');
  const geoData = await geoRes.json();

  // precompute a centroid for every country — used for labels + as the pin location when planting
  geoData.features.forEach(f => {
    countryCentroids[f.properties.ADMIN] = computeCentroid(f);
  });

  const data = await computeVisitedData();
  visitedCountries = data.visited;
  visitedPinsData = data.pins;

  // filter out tiny territories/islands so the globe isn't cluttered with labels
  const labelFeatures = geoData.features.filter(d => d.properties.POP_EST > 100000);

  globe
    .polygonsData(geoData.features)
    .polygonAltitude(0.01)
    .polygonCapColor(() => 'rgba(46,42,38,0.15)')
    .polygonSideColor(() => 'rgba(0,0,0,0.15)')
    .polygonStrokeColor(() => '#2e2a26')
    .polygonLabel(d => d.properties.ADMIN)
    .onPolygonClick(d => {
      openPinPopup(d.properties.ADMIN);
    })

    // --- country name labels (always-on, not hover-based) ---
    .labelsData(labelFeatures)
    .labelLat(d => countryCentroids[d.properties.ADMIN].lat)
    .labelLng(d => countryCentroids[d.properties.ADMIN].lng)
    .labelText(d => d.properties.ADMIN)
    .labelSize(d => Math.max(1, Math.sqrt(d.properties.POP_EST) * 4e-5))
    .labelDotRadius(0)
    .labelColor(() => '#2e2a26')
    .labelResolution(2)
    .labelAltitude(0.011)
    // --- red pins for manually-visited countries ---
    .htmlElementsData(visitedPinsData)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.02)
    .htmlElement(makePinElement);
}

loadCountries();

const pinPopup = document.getElementById('pin-popup');
const pinPopupCountry = document.getElementById('pin-popup-country');
const popupClose = document.getElementById('popup-close');
const popupPlantPin = document.getElementById('popup-plant-pin');
const popupViewMemories = document.getElementById('popup-view-memories');
const popupAddMemory = document.getElementById('popup-add-memory');
const memorySpinBtn = document.getElementById('memory-spin-btn');

const memoryOptions = document.getElementById('memory-options');
const memoryOptionsCountry = document.getElementById('memory-options-country');
const memoryOptionsClose = document.getElementById('memory-options-close');
const memoryOptionBtns = document.querySelectorAll('.memory-option-btn');

const journalEditor = document.getElementById('journal-editor');
const journalBackBtn = document.getElementById('journal-back-btn');
const journalSaveBtn = document.getElementById('journal-save-btn');
const journalLocationTag = document.getElementById('journal-editor-location');
const journalTitleInput = document.getElementById('journal-title-input');
const journalDateInput = document.getElementById('journal-date-input');
const journalBodyInput = document.getElementById('journal-body-input');

const peopleEditor = document.getElementById('people-editor');
const peopleBackBtn = document.getElementById('people-back-btn');
const peopleSaveBtn = document.getElementById('people-save-btn');
const peopleLocationTag = document.getElementById('people-editor-location');
const peopleNameInput = document.getElementById('people-name-input');
const peopleFromInput = document.getElementById('people-from-input');
const peopleMetWhereInput = document.getElementById('people-metwhere-input');
const peopleInstaInput = document.getElementById('people-insta-input');
const peopleWhatsappInput = document.getElementById('people-whatsapp-input');
const peopleNoteInput = document.getElementById('people-note-input');

const noteEditor = document.getElementById('note-editor');
const noteBackBtn = document.getElementById('note-back-btn');
const noteSaveBtn = document.getElementById('note-save-btn');
const noteLocationTag = document.getElementById('note-editor-location');
const noteBodyInput = document.getElementById('note-body-input');

const visitedListEl = document.getElementById('visited-list');

function renderVisitedList() {
  const countries = [...visitedCountries].sort(); // alphabetical

  if (countries.length === 0) {
    visitedListEl.innerHTML = '<p class="visited-empty">No countries visited yet — tap a country on the globe and plant a pin to get started.</p>';
    return;
  }

  visitedListEl.innerHTML = countries.map(country => `
    <div class="visited-item">
      <span class="visited-item-name">${country}</span>
    </div>
  `).join('');
}

let activeCountry = null;
let activeJournalEntryId = null;
let activePersonEntryId = null;
let activeNoteEntryId = null;

function openPinPopup(country) {
  activeCountry = country;
  pinPopupCountry.textContent = country;

  const isVisited = visitedCountries.has(country);
  popupPlantPin.style.display = isVisited ? 'none' : 'inline-block';
  popupPlantPin.disabled = false;              // always reset, even if a previous plant errored
  popupPlantPin.textContent = '📍 Plant Pin';
  popupViewMemories.style.display = isVisited ? 'inline-block' : 'none';
  popupAddMemory.style.display = isVisited ? 'inline-block' : 'none';

  memorySpinBtn.style.display = 'none';
  memoryOptions.classList.remove('active');
  pinPopup.classList.add('active');
}

function closePinPopup() {
  pinPopup.classList.remove('active');
  memorySpinBtn.style.display = 'inline-block';
}

function openMemoryOptions(country) {
  activeCountry = country;
  memoryOptionsCountry.textContent = country;

  pinPopup.classList.remove('active');
  memorySpinBtn.style.display = 'none';
  memoryOptions.classList.add('active');
}

function closeMemoryOptions() {
  memoryOptions.classList.remove('active');
  memorySpinBtn.style.display = 'inline-block';
}

function openJournalEditor(country, existingEntry = null) {
  activeCountry = country;
  journalLocationTag.textContent = country;

  if (existingEntry) {
    activeJournalEntryId = existingEntry.id;
    journalTitleInput.value = existingEntry.title || '';
    journalDateInput.value = existingEntry.date || new Date().toISOString().split('T')[0];
    journalBodyInput.value = existingEntry.content || '';
  } else {
    activeJournalEntryId = null;
    journalTitleInput.value = '';
    journalDateInput.value = new Date().toISOString().split('T')[0];
    journalBodyInput.value = '';
  }

  memoryOptions.classList.remove('active');
  journalEditor.classList.add('active');
  journalTitleInput.focus();
}

function closeJournalEditor() {
  journalEditor.classList.remove('active');
  memoryOptions.classList.add('active');
}

function openPeopleEditor(country, existingPerson = null) {
  activeCountry = country;
  peopleLocationTag.textContent = country;

  if (existingPerson) {
    activePersonEntryId = existingPerson.id;
    peopleNameInput.value = existingPerson.name || '';
    peopleFromInput.value = existingPerson.from || '';
    peopleMetWhereInput.value = existingPerson.metWhere || '';
    peopleInstaInput.value = existingPerson.instagram || '';
    peopleWhatsappInput.value = existingPerson.whatsapp || '';
    peopleNoteInput.value = existingPerson.note || '';
  } else {
    activePersonEntryId = null;
    peopleNameInput.value = '';
    peopleFromInput.value = '';
    peopleMetWhereInput.value = country;
    peopleInstaInput.value = '';
    peopleWhatsappInput.value = '';
    peopleNoteInput.value = '';
  }

  memoryOptions.classList.remove('active');
  peopleEditor.classList.add('active');
  peopleNameInput.focus();
}

function closePeopleEditor() {
  peopleEditor.classList.remove('active');
  memoryOptions.classList.add('active');
}

function openNoteEditor(country, existingNote = null) {
  activeCountry = country;
  noteLocationTag.textContent = country;

  if (existingNote) {
    activeNoteEntryId = existingNote.id;
    noteBodyInput.value = existingNote.content || '';
  } else {
    activeNoteEntryId = null;
    noteBodyInput.value = '';
  }

  memoryOptions.classList.remove('active');
  noteEditor.classList.add('active');
  noteBodyInput.focus();
}

function closeNoteEditor() {
  noteEditor.classList.remove('active');
  memoryOptions.classList.add('active');
}

popupClose.addEventListener('click', closePinPopup);

popupPlantPin.addEventListener('click', async () => {
  popupPlantPin.disabled = true;
  popupPlantPin.textContent = 'Planting...';

  try {
    await plantPin(activeCountry);
    await refreshVisitedData();
    openMemoryOptions(activeCountry); // straight into adding a memory after planting
  } catch (err) {
    console.error('Failed to plant pin:', err);
    alert('Something went wrong planting the pin — try again.');
  } finally {
    popupPlantPin.disabled = false;
    popupPlantPin.textContent = '📍 Plant Pin';
  }
});

popupViewMemories.addEventListener('click', () => {
  console.log('view memories for', activeCountry);
  closePinPopup();
});

popupAddMemory.addEventListener('click', () => {
  openMemoryOptions(activeCountry);
});

memoryOptionsClose.addEventListener('click', closeMemoryOptions);

memoryOptionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    if (type === 'journal') {
      openJournalEditor(activeCountry);
    } else if (type === 'people') {
      openPeopleEditor(activeCountry);
    } else if (type === 'note') {
      openNoteEditor(activeCountry);
    } else {
      console.log(`add ${type} for`, activeCountry);
    }
  });
});

journalBackBtn.addEventListener('click', closeJournalEditor);

journalSaveBtn.addEventListener('click', async () => {
  const title = journalTitleInput.value.trim();
  const date = journalDateInput.value;
  const content = journalBodyInput.value.trim();

  if (!title && !content) {
    alert('Write something before saving.');
    return;
  }

  journalSaveBtn.disabled = true;
  journalSaveBtn.textContent = 'Saving...';

  activeJournalEntryId = await saveJournalEntry({
    id: activeJournalEntryId,
    country: activeCountry,
    title, date, content
  });

  journalSaveBtn.disabled = false;
  journalSaveBtn.textContent = 'Save';
  closeJournalEditor();
});

peopleBackBtn.addEventListener('click', closePeopleEditor);

peopleSaveBtn.addEventListener('click', async () => {
  const name = peopleNameInput.value.trim();
  const from = peopleFromInput.value.trim();
  const metWhere = peopleMetWhereInput.value.trim();
  const instagram = peopleInstaInput.value.trim();
  const whatsapp = peopleWhatsappInput.value.trim();
  const note = peopleNoteInput.value.trim();

  if (!name) {
    alert('Add at least a name before saving.');
    return;
  }

  peopleSaveBtn.disabled = true;
  peopleSaveBtn.textContent = 'Saving...';

  activePersonEntryId = await savePersonEntry({
    id: activePersonEntryId,
    country: activeCountry,
    name, from, metWhere, instagram, whatsapp, note
  });

  peopleSaveBtn.disabled = false;
  peopleSaveBtn.textContent = 'Save';
  closePeopleEditor();
});

noteBackBtn.addEventListener('click', closeNoteEditor);

noteSaveBtn.addEventListener('click', async () => {
  const content = noteBodyInput.value.trim();

  if (!content) {
    alert('Write something before saving.');
    return;
  }

  noteSaveBtn.disabled = true;
  noteSaveBtn.textContent = 'Saving...';

  activeNoteEntryId = await saveNoteEntry({
    id: activeNoteEntryId,
    country: activeCountry,
    content
  });

  noteSaveBtn.disabled = false;
  noteSaveBtn.textContent = 'Save';
  closeNoteEditor();
});