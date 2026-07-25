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
    sideMenu.classList.remove('open');
    overlay.classList.remove('active');
  });
});

const { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp } = window.firestoreFns;
const db = window.db;

const countryCoords = {
  "Nepal": { lat: 28.3949, lng: 84.1240 },
  "India": { lat: 20.5937, lng: 78.9629 },
};

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

async function addMemory(country, city, notes, people) {
  const coords = countryCoords[country];
  if (!coords) {
    console.error("Unknown country — add it to countryCoords first:", country);
    return;
  }

  const memory = {
    country,
    countryLat: coords.lat,
    countryLng: coords.lng,
    city,
    notes,
    people: people || [],
    date: new Date().toISOString().split('T')[0]
  };

  await addDoc(collection(db, "entries"), memory);
}

async function getEntries() {
  const snapshot = await getDocs(collection(db, "entries"));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// --- journal entries ---
async function saveJournalEntry({ id, country, title, date, content }) {
  if (id) {
    await updateDoc(doc(db, "journalEntries", id), {
      title,
      date,
      content,
      country,
      updatedAt: serverTimestamp()
    });
  } else {
    await addDoc(collection(db, "journalEntries"), {
      title,
      date,
      content,
      country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

// --- people entries ---
async function savePersonEntry({ id, country, name, from, metWhere, instagram, whatsapp, note }) {
  if (id) {
    await updateDoc(doc(db, "people", id), {
      name,
      from,
      metWhere,
      instagram,
      whatsapp,
      note,
      country,
      updatedAt: serverTimestamp()
    });
  } else {
    await addDoc(collection(db, "people"), {
      name,
      from,
      metWhere,
      instagram,
      whatsapp,
      note,
      country,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

let visitedCountries = new Set();

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

  const entries = await getEntries();
  visitedCountries = new Set(entries.map(e => e.country));

  // one pin per visited country, using the lat/lng stored on its first entry
  const pinsData = [...visitedCountries].map(country => {
    const entry = entries.find(e => e.country === country);
    return { country, lat: entry.countryLat, lng: entry.countryLng };
  });

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
    .labelLat(d => computeCentroid(d).lat)
    .labelLng(d => computeCentroid(d).lng)
    .labelText(d => d.properties.ADMIN)
    .labelSize(d => Math.max(1, Math.sqrt(d.properties.POP_EST) * 4e-5))
    .labelDotRadius(0)
    .labelColor(() => '#2e2a26')
    .labelResolution(2)
    .labelAltitude(0.011)
    // --- red pins for visited countries ---
    .htmlElementsData(pinsData)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.02)
    .htmlElement(makePinElement);
}

loadCountries();

const pinPopup = document.getElementById('pin-popup');
const pinPopupCountry = document.getElementById('pin-popup-country');
const popupClose = document.getElementById('popup-close');
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

let activeCountry = null;
let activeJournalEntryId = null; // null = creating a new entry
let activePersonEntryId = null;  // null = creating a new person

function openPinPopup(country) {
  activeCountry = country;
  pinPopupCountry.textContent = country;

  const isVisited = visitedCountries.has(country);
  popupViewMemories.style.display = isVisited ? 'inline-block' : 'none';

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
  memoryOptions.classList.add('active'); // back to the +Journal/+People/+Note/+Photos list
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
    peopleMetWhereInput.value = country; // pre-fill with the country you tapped
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
  memoryOptions.classList.add('active'); // back to the options list
}

popupClose.addEventListener('click', closePinPopup);

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
    } else {
      console.log(`add ${type} for`, activeCountry);
      // Note / Photos get built next, one at a time
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

  await saveJournalEntry({
    id: activeJournalEntryId,
    country: activeCountry,
    title,
    date,
    content
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

  await savePersonEntry({
    id: activePersonEntryId,
    country: activeCountry,
    name,
    from,
    metWhere,
    instagram,
    whatsapp,
    note
  });

  peopleSaveBtn.disabled = false;
  peopleSaveBtn.textContent = 'Save';
  closePeopleEditor();
});