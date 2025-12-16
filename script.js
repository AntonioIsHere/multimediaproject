// Sample events dataset (latitude, longitude near Bucharest as sample)
const events = [
	{ id: 1, title: 'Handmade Crafts Fair', lat: 44.439663, lon: 26.096306, date: '2025-11-28', place: 'Old Town', type: 'fair', audioUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
	{ id: 2, title: 'Weekend Yoga Workshop', lat: 44.435, lon: 26.1, date: '2025-11-25', place: 'Park Herastrau', type: 'workshop' },
	{ id: 3, title: 'Indie Music Festival', lat: 44.42, lon: 26.08, date: '2025-12-05', place: 'Open Air Stage', type: 'festival', audioUrl: '' },
	{ id: 4, title: 'Photography Walk', lat: 44.445, lon: 26.09, date: '2025-11-30', place: 'Museum Quarter', type: 'meetup' },
	{ id: 5, title: 'Local Food Tasting', lat: 44.43, lon: 26.11, date: '2025-12-01', place: 'City Market', type: 'festival' }
];

// DOM refs
const locateBtn = document.getElementById('locateBtn');
const mockLocBtn = document.getElementById('mockLocBtn');
const radiusInput = document.getElementById('radius');
const eventsList = document.getElementById('eventsList');
const canvas = document.getElementById('eventsCanvas');
const tooltip = document.getElementById('tooltip');

let userLoc = null; // {lat, lon}
let filtered = [];

// Utility: haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2){
	const R = 6371; // km
	const toRad = d => d * Math.PI/180;
	const dLat = toRad(lat2-lat1);
	const dLon = toRad(lon2-lon1);
	const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
	const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	return R*c;
}

// Render event cards
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

		card.querySelector('.join-btn').addEventListener('click', () => {
			card.querySelector('.join-btn').textContent = 'Joined';
			card.querySelector('.join-btn').disabled = true;
			card.style.background = '#f4fffc';
		});

		card.addEventListener('mouseenter', () => highlightOnCanvas(e.id));
		card.addEventListener('mouseleave', () => highlightOnCanvas(null));

		// audio preview
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

// --- Audio API setup ---
let audioCtx = null;
let masterGain = null;
let analyser = null;
let currentSource = null;
let currentEventId = null;
const audioCache = new Map();

const globalPlay = document.getElementById('globalPlay');
const volumeControl = document.getElementById('volume');
const vizCanvas = document.getElementById('viz');
const vizCtx = vizCanvas.getContext('2d');

function ensureAudioContext(){
	if(audioCtx) return;
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	masterGain = audioCtx.createGain();
	masterGain.gain.value = parseFloat(volumeControl.value || 0.9);
	analyser = audioCtx.createAnalyser();
	analyser.fftSize = 256;
	masterGain.connect(audioCtx.destination);
	analyser.connect(masterGain);
	requestAnimationFrame(drawViz);
}

function stopCurrentAudio(){
	if(currentSource){
		try{ currentSource.stop(); }catch(e){}
		currentSource.disconnect();
		currentSource = null;
	}
	// stop speech synthesis too
	if(window.speechSynthesis){ window.speechSynthesis.cancel(); }
	currentEventId = null;
	// update UI
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
	// stop previous
	if(currentEventId === ev.id){ stopCurrentAudio(); return; }
	stopCurrentAudio();
	// ensure context on user gesture
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
			// ui
			document.querySelectorAll('.audio-btn.playing').forEach(b=>{ b.classList.remove('playing'); b.textContent = 'Preview'; });
			buttonEl.classList.add('playing'); buttonEl.textContent='Stop';
			src.onended = () => { stopCurrentAudio(); };
		} else {
			// fallback to speech
			speakEvent(ev, buttonEl);
		}
	} else {
		// no file — use SpeechSynthesis as fallback (read title and place)
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

// viz
function drawViz(){
	requestAnimationFrame(drawViz);
	if(!analyser) return;
	const w = vizCanvas.width = vizCanvas.clientWidth * (window.devicePixelRatio || 1);
	const h = vizCanvas.height = vizCanvas.clientHeight * (window.devicePixelRatio || 1);
	const data = new Uint8Array(analyser.frequencyBinCount);
	analyser.getByteTimeDomainData(data);
	vizCtx.clearRect(0,0,w,h);
	vizCtx.lineWidth = 2 * (window.devicePixelRatio || 1);
	vizCtx.strokeStyle = '#2b7a78';
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

volumeControl.addEventListener('input', ()=>{
	if(masterGain) masterGain.gain.value = parseFloat(volumeControl.value);
});

globalPlay.addEventListener('click', ()=>{
	// if there is a highlighted event, play it; otherwise play first filtered
	const toPlay = filtered[0] || null;
	if(!toPlay) return alert('No event selected to play.');
	const btn = eventsList.querySelector(`.audio-btn[data-id='${toPlay.id}']`);
	btn && btn.click();
});

// Canvas rendering
const ctx = canvas.getContext('2d');
let canvasState = { width:0, height:0, deviceRatio:1, scale:1, viewRadiusKm:50, points:[], highlightedId:null };

function resizeCanvas(){
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
	if(!userLoc) return;
	const centerLat = userLoc.lat; const centerLon = userLoc.lon;
	const meanLat = centerLat * Math.PI/180;
	const kmPerDegLat = 111.32; // approx
	const kmPerDegLon = 40075 * Math.cos(meanLat) / 360;

	const maxDist = parseFloat(radiusInput.value) || 50;
	canvasState.viewRadiusKm = maxDist;

	// map distances in km into canvas radius (min dimension/2 - padding)
	const radiusPx = Math.min(canvasState.width, canvasState.height)/2 - 40;
	canvasState.scale = radiusPx / maxDist;

	canvasState.points = filtered.map(e => {
		const dxKm = (e.lon - centerLon) * kmPerDegLon;
		const dyKm = (e.lat - centerLat) * kmPerDegLat; // north positive
		const x = canvasState.width/2 + dxKm * canvasState.scale;
		const y = canvasState.height/2 - dyKm * canvasState.scale;
		return { id: e.id, x, y, r: 8 + Math.max(0, 10 - e.distanceKm/5), title: e.title, distance: e.distanceKm };
	});
}

function drawCanvas(){
	resizeCanvas();
	ctx.clearRect(0,0,canvasState.width,canvasState.height);
	// background grid
	drawGrid();
	// center (user)
	ctx.save();
	ctx.translate(canvasState.width/2, canvasState.height/2);
	ctx.fillStyle = '#2b7a78';
	ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
	ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.textAlign='center'; ctx.fillText('You', 0, 28);
	ctx.restore();

	// draw event points
	canvasState.points.forEach(p => {
		ctx.beginPath();
		ctx.fillStyle = canvasState.highlightedId === p.id ? '#ff7a59' : '#4b79a1';
		ctx.arc(p.x, p.y, canvasState.highlightedId === p.id ? p.r+4 : p.r, 0, Math.PI*2);
		ctx.fill();
		// label
		ctx.fillStyle = '#123'; ctx.font = '11px Arial'; ctx.textAlign = 'left';
		ctx.fillText(p.title, p.x + p.r + 6, p.y + 4);
	});
}

function drawGrid(){
	const cx = canvasState.width/2; const cy = canvasState.height/2;
	ctx.save();
	ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
	// concentric circles every 10km
	const stepKm = Math.max(5, Math.ceil(canvasState.viewRadiusKm/5));
	for(let km = stepKm; km <= canvasState.viewRadiusKm; km += stepKm){
		const r = km * canvasState.scale;
		ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
	}
	ctx.restore();
}

// Highlight from card or canvas
function highlightOnCanvas(id){
	canvasState.highlightedId = id;
	drawCanvas();
}

// Canvas mouse interactions: tooltip and click
function onCanvasMove(e){
	const rect = canvas.getBoundingClientRect();
	const mx = (e.clientX - rect.left);
	const my = (e.clientY - rect.top);
	let found = null;
	for(const p of canvasState.points){
		const dx = mx - p.x; const dy = my - p.y; if(Math.hypot(dx,dy) <= p.r + 6){ found = p; break; }
	}
	if(found){
		tooltip.style.display = 'block'; tooltip.setAttribute('aria-hidden','false');
		tooltip.textContent = `${found.title} — ${found.distance.toFixed(1)} km`;
		tooltip.style.left = (found.x) + 'px'; tooltip.style.top = (found.y) + 'px';
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
			// scroll to card
			const card = eventsList.querySelector(`[data-id='${p.id}']`);
			if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.style.transition='background 0.2s'; card.style.background='#fff7e6'; setTimeout(()=>card.style.background='',900); }
			break;
		}}
}

// Filter events by radius and compute distances
function filterEvents(){
	if(!userLoc) return [];
	const maxDist = parseFloat(radiusInput.value) || 50;
	const res = events.map(e => ({...e, distanceKm: haversineDistance(userLoc.lat, userLoc.lon, e.lat, e.lon)}))
								.filter(e => e.distanceKm <= maxDist)
								.sort((a,b)=>a.distanceKm - b.distanceKm);
	filtered = res;
	return res;
}

// Main flow
function updateAll(){
	if(!userLoc) return;
	const items = filterEvents();
	renderEventsList(items);
	computePoints();
	drawCanvas();
}

// Location helpers
function useSampleLocation(){
	// sample: Bucharest center
	userLoc = { lat:44.4268, lon:26.1025 };
	updateAll();
}

function tryGeolocation(){
	if(!navigator.geolocation){ alert('Geolocation not supported in this browser.'); useSampleLocation(); return; }
	navigator.geolocation.getCurrentPosition(pos => {
		userLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
		updateAll();
	}, err => {
		console.warn('Geolocation failed, using sample location.', err);
		useSampleLocation();
	}, { enableHighAccuracy: false, timeout: 8000 });
}

// Events
locateBtn.addEventListener('click', () => tryGeolocation());
mockLocBtn.addEventListener('click', () => { useSampleLocation(); });
radiusInput.addEventListener('change', () => updateAll());

// Canvas interactions
canvas.addEventListener('mousemove', onCanvasMove);
canvas.addEventListener('mouseleave', () => { tooltip.style.display='none'; canvasState.highlightedId=null; drawCanvas(); });
canvas.addEventListener('click', onCanvasClick);
window.addEventListener('resize', () => { computePoints(); drawCanvas(); });

// Init: set a default size and sample location
function init(){
	// give the canvas a reasonable height
	const wrap = canvas.parentElement; wrap.style.minHeight = '420px';
	// try to use geolocation, but fallback to sample
	tryGeolocation();
}

init();

