// Sample events dataset (latitude, longitude near Bucharest as sample)
const events = [
	{ id: 1, title: 'Handmade Crafts Fair', lat: 44.439663, lon: 26.096306, date: '2025-11-28', place: 'Old Town', type: 'fair' },
	{ id: 2, title: 'Weekend Yoga Workshop', lat: 44.435, lon: 26.1, date: '2025-11-25', place: 'Park Herastrau', type: 'workshop' },
	{ id: 3, title: 'Indie Music Festival', lat: 44.42, lon: 26.08, date: '2025-12-05', place: 'Open Air Stage', type: 'festival' },
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
											<div class="event-actions"><button class="join-btn">Join</button></div>`;

		card.appendChild(thumb);
		card.appendChild(body);

		card.querySelector('.join-btn').addEventListener('click', () => {
			card.querySelector('.join-btn').textContent = 'Joined';
			card.querySelector('.join-btn').disabled = true;
			card.style.background = '#f4fffc';
		});

		card.addEventListener('mouseenter', () => highlightOnCanvas(e.id));
		card.addEventListener('mouseleave', () => highlightOnCanvas(null));

		eventsList.appendChild(card);
	});
}

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

