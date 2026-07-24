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

const { collection, addDoc, getDocs } = window.firestoreFns;
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

let activeCountry = null;

function openPinPopup(country) {
  activeCountry = country;
  pinPopupCountry.textContent = country;

  const isVisited = visitedCountries.has(country);
  popupViewMemories.style.display = isVisited ? 'inline-block' : 'none';

  memorySpinBtn.style.display = 'none';
  pinPopup.classList.add('active');
}

function closePinPopup() {
  pinPopup.classList.remove('active');
  memorySpinBtn.style.display = 'inline-block';
}

popupClose.addEventListener('click', closePinPopup);

popupViewMemories.addEventListener('click', () => {
  console.log('view memories for', activeCountry);
  closePinPopup();
});

popupAddMemory.addEventListener('click', () => {
  console.log('add memory for', activeCountry);
  closePinPopup();
});