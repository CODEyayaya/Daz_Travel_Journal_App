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

async function loadCountries() {
  const geoRes = await fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson');
  const geoData = await geoRes.json();

  const entries = await getEntries();
  visitedCountries = new Set(entries.map(e => e.country));

  globe
    .polygonsData(geoData.features)
    .polygonAltitude(0.01)
    .polygonCapColor(d => visitedCountries.has(d.properties.ADMIN) ? '#e8a838' : 'rgba(46,42,38,0.15)')
    .polygonSideColor(() => 'rgba(0,0,0,0.15)')
    .polygonStrokeColor(() => '#2e2a26')
    .polygonLabel(d => d.properties.ADMIN)
    .onPolygonClick(d => {
      openPinPopup(d.properties.ADMIN);
    });
}

loadCountries();

const pinPopupOverlay = document.getElementById('pin-popup-overlay');
const pinPopupCountry = document.getElementById('pin-popup-country');
const popupClose = document.getElementById('popup-close');
const popupViewMemories = document.getElementById('popup-view-memories');
const popupAddMemory = document.getElementById('popup-add-memory');

let activeCountry = null;

function openPinPopup(country) {
  activeCountry = country;
  pinPopupCountry.textContent = country;
  pinPopupOverlay.classList.add('active');
}

function closePinPopup() {
  pinPopupOverlay.classList.remove('active');
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