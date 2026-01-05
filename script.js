const events = [
	{ id: 1, title: 'Handmade Crafts Fair', lat: 44.43365685862991, lon: 26.09807813986475, date: '2025-11-28', place: 'Calea Victoriei', type: 'fair'},
	{ id: 2, title: 'Weekend Yoga Workshop', lat: 44.46766523647163, lon: 26.08531561488676, date: '2025-11-25', place: 'Park Herastrau', type: 'workshop' },
	{ id: 3, title: 'Sabaton concert', lat: 44.412924779550536, lon: 26.09324593969963, date: '2025-12-05', place: 'Arenele Romane', type: 'festival' },
	{ id: 4, title: 'Street photography event', lat: 44.43185839104518, lon: 26.101035073760517, date: '2025-11-30', place: 'Museum Quarter', type: 'meetup' },
	{ id: 5, title: 'Local Food Tasting', lat: 44.450118843059066, lon: 26.13004233650032, date: '2025-12-01', place: 'Piata Obor', type: 'festival' }
];

const locateBtn = document.getElementById('locateBtn');
const mockLocBtn = document.getElementById('mockLocBtn');
const heatmapBtn = document.getElementById('heatmapBtn');
const radiusInput = document.getElementById('radius');
const radiusSlider = document.getElementById('radiusSlider');
const radiusValue = document.getElementById('radiusValue');
const eventsList = document.getElementById('eventsList');
const canvas = document.getElementById('eventsCanvas');
const tooltip = document.getElementById('tooltip');

let userLoc = null;
let filtered = [];

const mapImage = new Image();
mapImage.src = 'assets/bucharestmap.jpg';
let mapImageLoaded = false;
mapImage.onload = () => { mapImageLoaded = true; requestAnimationFrame(drawCanvas); };

const mapBounds = { minLat: 44.33, maxLat: 44.48, minLon: 26.02, maxLon: 26.22 };

function latLonToCanvasXY(lat, lon){
	const w = canvasState.width; const h = canvasState.height;
	const u = (lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon);
	const v = (mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat);
	const ix = u * w; const iy = v * h;
	const cx = w/2; const cy = h/2;
	const scaleFactor = canvasState.baseScale ? (canvasState.scale / canvasState.baseScale) : 1;
	const x = cx + (ix - cx) * scaleFactor;
	const y = cy + (iy - cy) * scaleFactor;
	return { x, y };
}

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

		card.addEventListener('mouseenter', () => { highlightOnCanvas(e.id); if(typeof highlightOnMap === 'function') highlightOnMap(e.id); });
		card.addEventListener('mouseleave', () => { highlightOnCanvas(null); if(typeof highlightOnMap === 'function') highlightOnMap(null); });

		const audioBtn = card.querySelector('.audio-btn');
		if(audioBtn){
			audioBtn.addEventListener('click', async () => {
				const id = parseInt(audioBtn.dataset.id,10);
				const ev = items.find(it => it.id === id);
				if(!ev) return;
				await playEventAudio(ev, audioBtn);
			});
		}

		eventsList.appendChild(card);
	});
}

let audioCtx = null;
let masterGain = null;
let analyser = null;
let currentSource = null;
let currentEventId = null;
const audioCache = new Map();

const globalPlay = document.getElementById('globalPlay');
const volumeControl = document.getElementById('volume');
const vizCanvas = document.getElementById('viz');
const vizCtx = vizCanvas ? vizCanvas.getContext('2d') : null;

function ensureAudioContext(){
	if(audioCtx) return;
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	masterGain = audioCtx.createGain();
	masterGain.gain.value = parseFloat((volumeControl && volumeControl.value) || 0.9);
	analyser = audioCtx.createAnalyser();
	analyser.fftSize = 256;
	masterGain.connect(audioCtx.destination);
	analyser.connect(masterGain);
	if(vizCtx) requestAnimationFrame(drawViz);
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
			src.connect(analyser);
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

function drawViz(){
	if(!vizCtx || !vizCanvas) return;
	requestAnimationFrame(drawViz);
	if(!analyser) return;
	const w = vizCanvas.width = vizCanvas.clientWidth * (window.devicePixelRatio || 1);
	const h = vizCanvas.height = vizCanvas.clientHeight * (window.devicePixelRatio || 1);
	const data = new Uint8Array(analyser.frequencyBinCount);
	analyser.getByteTimeDomainData(data);
	vizCtx.clearRect(0,0,w,h);
	vizCtx.lineWidth = 2 * (window.devicePixelRatio || 1);
	vizCtx.strokeStyle = '#1F7A8C';
	vizCtx.beginPath();
	const sliceWidth = w / data.length;
	let x = 0;
	for(let i=0;i<data.length;i++){
		const v = data[i]/128.0;
		const y = v*h/2;
		if(i===0) vizCtx.moveTo(x,y); else vizCtx.lineTo(x,y);
		x += sliceWidth;
	}
	vizCtx.stroke();
} 

if(volumeControl){
	volumeControl.addEventListener('input', ()=>{
		if(masterGain) masterGain.gain.value = parseFloat(volumeControl.value);
	});
}

if(globalPlay){
	globalPlay.addEventListener('click', ()=>{
		const toPlay = filtered[0] || null;
		if(!toPlay) return alert('No event selected to play.');
		const btn = eventsList.querySelector(`.audio-btn[data-id='${toPlay.id}']`);
		btn && btn.click();
	});
}

let map = null;
let eventMarkers = new Map();
let userMarker = null;
let lastHighlightedMarker = null;
let heatmapCanvas = null;
let heatmapCtx = null;
let heatmapVisible = false;

const ctx = canvas ? canvas.getContext('2d') : null;
let canvasState = { width:0, height:0, deviceRatio:1, scale:1, viewRadiusKm:50, points:[], highlightedId:null, baseScale:null, baseViewKm:null };
const hasCanvas = () => !!canvas && !!ctx;

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
		gradient.addColorStop(0, 'rgba(23, 99, 111, 0.75)');
		gradient.addColorStop(0.5, 'rgba(23, 99, 111, 0.2)');
		gradient.addColorStop(1, 'rgba(23, 99, 111, 0)');
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

function resizeCanvas(){
	if(!hasCanvas()) return;
	const rect = canvas.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.floor(rect.width * dpr);
	canvas.height = Math.floor(rect.height * dpr);
	canvas.style.width = rect.width + 'px';
	canvas.style.height = rect.height + 'px';
	ctx.setTransform(dpr,0,0,dpr,0,0);
	canvasState.deviceRatio = dpr;
	canvasState.width = rect.width;
	canvasState.height = rect.height;
}

function computePoints(){
	if(!hasCanvas()) return;
	if(!userLoc) return;
	if(canvasState.width <= 0 || canvasState.height <= 0){
		resizeCanvas();
		if(canvasState.width <= 0 || canvasState.height <= 0) return;
	}
	const centerLat = userLoc.lat; const centerLon = userLoc.lon;
	const meanLat = centerLat * Math.PI/180;
	const kmPerDegLat = 111.32;
	const kmPerDegLon = 40075 * Math.cos(meanLat) / 360;

	const maxDist = parseFloat(radiusInput.value) || 50;
	canvasState.viewRadiusKm = maxDist;

	const radiusPx = Math.min(canvasState.width, canvasState.height)/2 - 40;
	canvasState.scale = radiusPx / maxDist;

	canvasState.points = filtered.map(e => {
		const pos = latLonToCanvasXY(e.lat, e.lon);
		let x = pos.x;
		let y = pos.y;

		const dist = e.distanceKm;
		const maxDispersion = 18;
		const dispersionPx = Math.min(maxDispersion, maxDispersion * Math.exp(-dist/6));
		const angle = ((e.id * 137.508) % 360) * Math.PI / 180;
		x += Math.cos(angle) * dispersionPx;
		y += Math.sin(angle) * dispersionPx;

		const r = 8 + Math.max(0, 10 - e.distanceKm/5);
		const pad = 6;
		x = Math.max(r + pad, Math.min(x, canvasState.width - r - pad));
		y = Math.max(r + pad, Math.min(y, canvasState.height - r - pad));

		return { id: e.id, x, y, r, title: e.title, distance: e.distanceKm, dispersionPx };
	});
}

function drawCanvas(){
	if(!hasCanvas()) return;
	resizeCanvas();
	ctx.clearRect(0,0,canvasState.width,canvasState.height);
	if(mapImageLoaded){
		const cx = canvasState.width/2, cy = canvasState.height/2;
		ctx.save();
		const scaleFactor = canvasState.baseScale ? (canvasState.scale / canvasState.baseScale) : 1;
		ctx.translate(cx, cy);
		ctx.scale(scaleFactor, scaleFactor);
		ctx.drawImage(mapImage, -cx, -cy, canvasState.width, canvasState.height);
		ctx.restore();
	}
	const userPos = userLoc ? latLonToCanvasXY(userLoc.lat, userLoc.lon) : { x: canvasState.width/2, y: canvasState.height/2 };
	drawGrid(userPos.x, userPos.y);
	ctx.save();
	ctx.translate(userPos.x, userPos.y);
	ctx.fillStyle = '#1F7A8C';
	ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
	ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.textAlign='center'; ctx.fillText('You', 0, 28);
	ctx.restore();

	canvasState.points.forEach(p => {
		const x = p.x + (canvasState.offsetX || 0);
		const y = p.y + (canvasState.offsetY || 0);
		const isHighlighted = canvasState.highlightedId === p.id;
		const r = isHighlighted ? p.r + 6 : p.r + 2;

		ctx.beginPath();
		ctx.fillStyle = isHighlighted ? '#ff7a59' : '#1F7A8C';
		ctx.arc(x, y, r, 0, Math.PI*2);
		ctx.fill();

		if(isHighlighted){
			ctx.beginPath();
			ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,122,89,0.95)'; ctx.stroke();
			ctx.save(); ctx.shadowColor = 'rgba(255,122,89,0.12)'; ctx.shadowBlur = 12; ctx.restore();
		}

		ctx.fillStyle = '#123'; ctx.font = '12px Arial';
		const labelXDefault = x + r + 8;
		const labelRightLimit = canvasState.width - 6;
		const textWidth = ctx.measureText(p.title).width;
		if(labelXDefault + textWidth > labelRightLimit){
			ctx.textAlign = 'right';
			ctx.fillText(p.title, x - r - 8, y + 4);
		} else {
			ctx.textAlign = 'left';
			ctx.fillText(p.title, labelXDefault, y + 4);
		}
	});
}

function drawGrid(cx = canvasState.width/2, cy = canvasState.height/2){
	ctx.save();
	ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
	const stepKm = Math.max(5, Math.ceil(canvasState.viewRadiusKm/5));
	for(let km = stepKm; km <= canvasState.viewRadiusKm; km += stepKm){
		const r = km * canvasState.scale;
		ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
	}
	ctx.restore();
}

function highlightOnCanvas(id){
	canvasState.highlightedId = id;
	drawCanvas();
}



function onCanvasMove(e){
	const rect = canvas.getBoundingClientRect();
	const mx = (e.clientX - rect.left);
	const my = (e.clientY - rect.top);
	let found = null;
	for(const p of canvasState.points){
		const dx = mx - p.x; const dy = my - p.y; if(Math.hypot(dx,dy) <= p.r + 6){ found = p; break; }
	}
	if(found){
		tooltip.textContent = `${found.title} — ${found.distance.toFixed(1)} km`; 
		tooltip.style.display = 'block'; tooltip.setAttribute('aria-hidden','false');
		const tw = tooltip.offsetWidth || 120;
		const th = tooltip.offsetHeight || 28;
		const minCenterX = tw/2 + 6;
		const maxCenterX = canvasState.width - tw/2 - 6;
		const clampedX = Math.max(minCenterX, Math.min(found.x, maxCenterX));
		const minTop = th + 8; 
		const maxTop = canvasState.height - 8;
		const clampedY = Math.max(minTop, Math.min(found.y, maxTop));
		tooltip.style.left = clampedX + 'px'; tooltip.style.top = clampedY + 'px';
		canvasState.highlightedId = found.id;
		drawCanvas();
	} else {
		tooltip.style.display = 'none'; tooltip.setAttribute('aria-hidden','true');
		canvasState.highlightedId = null; drawCanvas();
	}
}

function onCanvasClick(e){
	const rect = canvas.getBoundingClientRect();
	const mx = (e.clientX - rect.left);
	const my = (e.clientY - rect.top);
	for(const p of canvasState.points){
		const dx = mx - p.x; const dy = my - p.y; if(Math.hypot(dx,dy) <= p.r + 6){
			const card = eventsList.querySelector(`[data-id='${p.id}']`);
			if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.style.transition='background 0.2s'; card.style.background='#fff7e6'; setTimeout(()=>card.style.background='',900); }
			break;
		}}
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
	computePoints();
	drawCanvas();
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

if(hasCanvas()){
	canvas.addEventListener('mousemove', onCanvasMove);
	canvas.addEventListener('mouseleave', () => { tooltip.style.display='none'; canvasState.highlightedId=null; drawCanvas(); });
	canvas.addEventListener('click', onCanvasClick);
}
window.addEventListener('resize', () => { computePoints(); drawCanvas(); });

function onFullscreenChange(){
	setTimeout(()=>{ resizeCanvas(); computePoints(); drawCanvas(); }, 80);
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);
document.addEventListener('mozfullscreenchange', onFullscreenChange);

function init(){
	resizeCanvas();
	const wrap = canvas ? canvas.parentElement : document.getElementById('map').parentElement; wrap.style.minHeight = '420px';
	initMap();
	tryGeolocation();
	requestAnimationFrame(()=>{ computePoints(); if(!canvasState.baseScale){ canvasState.baseViewKm = canvasState.viewRadiusKm; canvasState.baseScale = canvasState.scale; } if(map) updateMap(filterEvents()); drawCanvas(); });
}

init();