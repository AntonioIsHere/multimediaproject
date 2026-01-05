const events = [
	{ id: 1, title: 'Handmade Crafts Fair', lat: 44.43365685862991, lon: 26.09807813986475, date: '2025-11-28', place: 'Calea Victoriei', type: 'fair', videoUrl: 'assets/Bucharest_Handmade_Crafts_Fair_Video.mp4'},
	{ id: 2, title: 'Weekend Yoga Workshop', lat: 44.46766523647163, lon: 26.08531561488676, date: '2025-11-25', place: 'Park Herastrau', type: 'workshop', videoUrl: 'assets/Bucharest_Yoga_Workshop_Video_Generated.mp4' },
	{ id: 3, title: 'Sabaton concert', lat: 44.412924779550536, lon: 26.09324593969963, date: '2025-12-05', place: 'Arenele Romane', type: 'festival', videoUrl: 'assets/sabatonevent.mp4' },
	{ id: 4, title: 'Street photography event', lat: 44.43185839104518, lon: 26.101035073760517, date: '2025-11-30', place: 'Old town', type: 'meetup', videoUrl: 'assets/Bucharest_Street_Photography_Event_Video.mp4' },
	{ id: 5, title: 'Local Food Tasting', lat: 44.450118843059066, lon: 26.13004233650032, date: '2025-12-01', place: 'Piata Obor', type: 'festival', videoUrl: 'assets/Bucharest_Food_Tasting_Video_Generated.mp4' }
];

const locateBtn = document.getElementById('locateBtn');
const mockLocBtn = document.getElementById('mockLocBtn');
const heatmapBtn = document.getElementById('heatmapBtn');
const radiusInput = document.getElementById('radius');
const radiusSlider = document.getElementById('radiusSlider');
const radiusValue = document.getElementById('radiusValue');
const eventsList = document.getElementById('eventsList');

let userLoc = null;
let filtered = [];

function haversineDistance(lat1, lon1, lat2, lon2){
	const R = 6371;
	const toRad = d => d * Math.PI/180;
	const dLat = toRad(lat2-lat1);
	const dLon = toRad(lon2-lon1);
	const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
	const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	return R*c;
}

function renderEventsList(items){
	eventsList.innerHTML = '';
	if(items.length === 0){
		eventsList.innerHTML = '<p style="padding:12px;color:#666">No events found in this radius.</p>';
		return;
	}

	items.forEach(e => {
		const card = document.createElement('article');
		card.className = 'event-card';
		card.dataset.id = e.id;

		const thumb = document.createElement('div');
		thumb.className = 'event-thumb';
		thumb.style.background = '#e6eef6';
		thumb.textContent = e.type[0].toUpperCase();

		const body = document.createElement('div');
		body.className = 'event-body';
		body.innerHTML = `<h3 class="event-title">${e.title}</h3>
							<div class="event-meta">${e.place} • ${e.date} • ${e.distanceKm.toFixed(1)} km</div>
							<div class="event-actions">
								<button class="join-btn">Join</button>
								<button class="audio-btn" data-id="${e.id}">Preview</button>
								<button class="video-btn" data-id="${e.id}">Video Preview</button>
							</div>`;

		card.appendChild(thumb);
		card.appendChild(body);

		const joinBtn = card.querySelector('.join-btn');
		const origEvent = events.find(ev => ev.id === e.id);
		const isJoined = origEvent && origEvent.joined;
		joinBtn.textContent = isJoined ? 'Joined' : 'Join';
		joinBtn.classList.toggle('joined', !!isJoined);
		card.style.background = isJoined ? '#f4fffc' : '';

		joinBtn.addEventListener('click', () => {
			if(!origEvent) return;
			origEvent.joined = !origEvent.joined;
			joinBtn.textContent = origEvent.joined ? 'Joined' : 'Join';
			joinBtn.classList.toggle('joined', origEvent.joined);
			card.style.background = origEvent.joined ? '#f4fffc' : '';
		});

		const audioBtn = card.querySelector('.audio-btn');
		if(audioBtn){
			audioBtn.addEventListener('click', async () => {
				const id = parseInt(audioBtn.dataset.id,10);
				const ev = items.find(it => it.id === id);
				if(!ev) return;
				await playEventAudio(ev, audioBtn);
			});
		}

		const videoBtn = card.querySelector('.video-btn');
		if(videoBtn){
			videoBtn.addEventListener('click', () => {
				const id = parseInt(videoBtn.dataset.id,10);
				const ev = items.find(it => it.id === id);
				if(!ev || !ev.videoUrl) return;
				playEventVideo(ev);
			});
		}

		eventsList.appendChild(card);
	});
}

let audioCtx = null;
let currentSource = null;
let currentEventId = null;
const audioCache = new Map();

function ensureAudioContext(){
	if(audioCtx) return;
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} 

function stopCurrentAudio(){
	if(currentSource){
		try{ currentSource.stop(); }catch(e){}
		currentSource.disconnect();
		currentSource = null;
	}
	if(window.speechSynthesis){ window.speechSynthesis.cancel(); }
	currentEventId = null;
	document.querySelectorAll('.audio-btn.playing').forEach(b=>{ b.classList.remove('playing'); b.textContent = 'Preview'; });
}

async function loadAudioBuffer(url){
	if(!url) return null;
	if(audioCache.has(url)) return audioCache.get(url);
	try{
		const resp = await fetch(url);
		const ab = await resp.arrayBuffer();
		ensureAudioContext();
		const buf = await audioCtx.decodeAudioData(ab);
		audioCache.set(url, buf);
		return buf;
	} catch(err){
		console.warn('Could not load audio', err);
		return null;
	}
}

async function playEventAudio(ev, buttonEl){
	if(currentEventId === ev.id){ stopCurrentAudio(); return; }
	stopCurrentAudio();
	ensureAudioContext();
	if(ev.audioUrl){
		const buf = await loadAudioBuffer(ev.audioUrl);
		if(buf){
			const src = audioCtx.createBufferSource();
			src.buffer = buf;
			src.connect(audioCtx.destination);
			src.start();
			currentSource = src;
			currentEventId = ev.id;
			document.querySelectorAll('.audio-btn.playing').forEach(b=>{ b.classList.remove('playing'); b.textContent = 'Preview'; });
			buttonEl.classList.add('playing'); buttonEl.textContent='Stop';
			src.onended = () => { stopCurrentAudio(); };
		} else {
			speakEvent(ev, buttonEl);
		}
	} else {
		speakEvent(ev, buttonEl);
	} 
}

function speakEvent(ev, buttonEl){
	if(!('speechSynthesis' in window)){ alert('No audio available and SpeechSynthesis is unsupported in your browser.'); return; }
	const msg = new SpeechSynthesisUtterance(`${ev.title}, at ${ev.place} on ${ev.date}.`);
	msg.onend = () => { stopCurrentAudio(); };
	currentEventId = ev.id;
	document.querySelectorAll('.audio-btn.playing').forEach(b=>{ b.classList.remove('playing'); b.textContent = 'Preview'; });
	buttonEl.classList.add('playing'); buttonEl.textContent='Stop';
	window.speechSynthesis.speak(msg);
}

function playEventVideo(ev){
	const videoModal = document.getElementById('videoModal');
	const eventVideo = document.getElementById('eventVideo');
	if(!videoModal || !eventVideo) return;
	eventVideo.src = ev.videoUrl;
	videoModal.style.display = 'block';
	eventVideo.play();
}


const videoModal = document.getElementById('videoModal');
const closeBtn = document.querySelector('.close');
if(closeBtn){
	closeBtn.onclick = function() {
		videoModal.style.display = 'none';
		const eventVideo = document.getElementById('eventVideo');
		if(eventVideo) {
			eventVideo.pause();
			eventVideo.currentTime = 0; 
		}
	}
}
if(videoModal){
	window.onclick = function(event) {
		if (event.target == videoModal) {
			videoModal.style.display = 'none';
			const eventVideo = document.getElementById('eventVideo');
			if(eventVideo) {
				eventVideo.pause();
				eventVideo.currentTime = 0;
			}
		}
	}
}



let map = null;
let eventMarkers = new Map();
let userMarker = null;
let lastHighlightedMarker = null;
let heatmapCanvas = null;
let heatmapCtx = null;
let heatmapVisible = false;

function initMap(){
	if(typeof L === 'undefined'){ console.warn('Leaflet (L) is not available. Is the Leaflet script loaded?'); return; }
	try{
		map = L.map('map').setView([44.4268, 26.1025], 13);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
		map.on('click', ()=>{ highlightOnMap(null); });
		map.on('moveend', ()=>{ if(map) drawHeatmap(); });
		map.on('zoomend', ()=>{ if(map) drawHeatmap(); });
		map.on('resize', ()=>{ resizeHeatmapCanvas(); if(heatmapVisible) drawHeatmap(); });

		// Add heatmap canvas overlay
		heatmapCanvas = document.createElement('canvas');
		heatmapCanvas.style.position = 'absolute';
		heatmapCanvas.style.top = '0';
		heatmapCanvas.style.left = '0';
		heatmapCanvas.style.width = '100%';
		heatmapCanvas.style.height = '100%';
		heatmapCanvas.style.pointerEvents = 'none';
		heatmapCanvas.style.zIndex = '1000';
		map.getContainer().appendChild(heatmapCanvas);
		heatmapCtx = heatmapCanvas.getContext('2d');
		resizeHeatmapCanvas();
	} catch(err){ console.error('Failed to initialize Leaflet map', err); }
}

function updateMap(items){
	if(!map) return;
	eventMarkers.forEach(m=>{ map.removeLayer(m); });
	eventMarkers.clear();
	items.forEach(e => {
		const marker = L.marker([e.lat, e.lon]).addTo(map).bindPopup(e.title);
		marker.on('click', ()=>{
			const card = eventsList.querySelector(`[data-id='${e.id}']`);
			if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.style.transition='background 0.2s'; card.style.background='#fff7e6'; setTimeout(()=>card.style.background='',900); }
			highlightOnMap(e.id);
		});
		eventMarkers.set(e.id, marker);
	});
	updateHeatmap();
}

function setUserMarker(lat, lon){
	if(!map) return;
	if(userMarker){ userMarker.setLatLng([lat,lon]); }
	else{ userMarker = L.marker([lat,lon]).addTo(map).bindPopup('You'); }
	map.setView([lat,lon], map.getZoom());
}

function resizeHeatmapCanvas(){
	if(!heatmapCanvas || !map) return;
	const dpr = window.devicePixelRatio || 1;
	const size = map.getSize();
	heatmapCanvas.width = size.x * dpr;
	heatmapCanvas.height = size.y * dpr;
	heatmapCanvas.style.width = size.x + 'px';
	heatmapCanvas.style.height = size.y + 'px';
	heatmapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawHeatmap(){
	if(!heatmapCtx || !map || !heatmapVisible) return;
	heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
	const items = filterEvents();
	const zoom = map.getZoom();
	const radius = 35 + (zoom - 10) * 2; // larger base size
	items.forEach(e => {
		const point = map.latLngToContainerPoint([e.lat, e.lon]);
		const gradient = heatmapCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
		gradient.addColorStop(0, 'rgba(255, 0, 0, 0.75)');
		gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.2)');
		gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
		heatmapCtx.fillStyle = gradient;
		heatmapCtx.beginPath();
		heatmapCtx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
		heatmapCtx.fill();
	});
}

function updateHeatmap(){
	if(heatmapVisible){
		drawHeatmap();
	} else {
		if(heatmapCtx) heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
	}
}

function toggleHeatmap(){
	heatmapVisible = !heatmapVisible;
	heatmapBtn.textContent = heatmapVisible ? 'Hide Heatmap' : 'Show Heatmap';
	heatmapBtn.classList.toggle('active', heatmapVisible);
	updateHeatmap();
}

function filterEvents(){ 
	const maxDist = parseFloat(radiusInput.value) || 50;
	const center = userLoc ? userLoc : { lat:44.4268, lon:26.1025 };
	const res = events.map(e => ({...e, distanceKm: haversineDistance(center.lat, center.lon, e.lat, e.lon)}))
					.filter(e => !userLoc || e.distanceKm <= maxDist)
	filtered = res;
	return res;
}

function updateAll(){
	if(!userLoc) return;
	const items = filterEvents();
	renderEventsList(items);
	if(map) updateMap(items);
}

function useSampleLocation(){
	userLoc = { lat:44.4268, lon:26.1025 };
	if(map) setUserMarker(userLoc.lat, userLoc.lon);
	updateAll();
}

function tryGeolocation(){
	if(!navigator.geolocation){ alert('Geolocation not supported in this browser.'); useSampleLocation(); return; }
	navigator.geolocation.getCurrentPosition(pos => {
		userLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
		if(map) setUserMarker(userLoc.lat, userLoc.lon);
		updateAll();
	}, err => {
		console.warn('Geolocation failed, using sample location.', err);
		useSampleLocation();
	}, { enableHighAccuracy: false, timeout: 8000 });
}

locateBtn.addEventListener('click', () => tryGeolocation());
mockLocBtn.addEventListener('click', () => { useSampleLocation(); });
heatmapBtn.addEventListener('click', () => toggleHeatmap());
radiusInput.addEventListener('change', () => {
	if(radiusSlider) radiusSlider.value = radiusInput.value;
	if(radiusValue) radiusValue.textContent = radiusInput.value + ' km';
	updateAll();
});

if(radiusSlider){
	radiusSlider.addEventListener('input', ()=>{
		radiusValue.textContent = radiusSlider.value + ' km';
		radiusInput.value = radiusSlider.value;
		updateAll();
	});
	radiusSlider.value = radiusInput.value;
	radiusValue.textContent = radiusSlider.value + ' km';
}

function init(){
	const wrap = document.getElementById('map').parentElement; wrap.style.minHeight = '420px';
	initMap();
	tryGeolocation();
	requestAnimationFrame(()=>{ if(map) updateMap(filterEvents()); });
}

init();