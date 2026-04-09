/* ═══════════════════════════════════════════════════════════════════
   S.T.A.R.S. by Traxion — app.js  (v3.0 MVP)
   Senior Full-Stack / Google Maps Platform
   ═══════════════════════════════════════════════════════════════════ */

/* ─── ⚙️  CONFIGURACIÓN — Inserta tu API Key aquí ─── */
const GOOGLE_MAPS_API_KEY = 'AIzaSyCJx9i34EEnANEaCdgW_ZkBBrfpz9egpUs';

/* ─── Constantes de Negocio ─── */
const STARS_CONFIG = {
  FUEL_OPTIMIZATION_FACTOR: 0.12,      // 12% estándar S.T.A.R.S.
  FUEL_CONSUMPTION_L_PER_KM: 0.35,     // Consumo base bus Traxion (L/km)
  FUEL_PRICE_MXN: 23.5,               // Precio combustible MXN/L
  SMART_STOP_RADIUS_M: 2000,           // Radio Places API (m)
  FLEET_SPREAD_KM: 0.08,              // Dispersión inicial de flota
  DIRECTIONS_COUNTRY: 'MX',
  MAP_CENTER_DEFAULT: { lat: 19.4326, lng: -99.1332 }, // CDMX
};

/* ─── Estado Global ─── */
const STATE = {
  map: null,
  directionsService: null,
  directionsRenderer: null,
  placesService: null,
  autocompleteOrigin: null,
  autocompleteDestino: null,
  geocoder: null,
  activeRoute: null,       // DirectionsResult
  routeDistance: 0,        // km
  routeDurationSec: 0,
  fleetMarkers: [],
  stopMarkers: [],
  infoWindows: [],
  msgCount: 0,
  isProcessing: false,
  mapsLoaded: false,
};

/* ══════════════════════════════════════════════════════════════════
   1.  BOOT — Inyección dinámica de Google Maps SDK
   ══════════════════════════════════════════════════════════════════ */

(function bootMaps() {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
    console.warn('[S.T.A.R.S.] API Key no configurada. Corriendo en modo demo.');
    startClock();
    sendSequence([
      '🛰️ <strong class="orange">S.T.A.R.S. v3.0 MVP</strong> inicializado. Todos los módulos cargados.',
      '⚙️ <strong>Modo Demo:</strong> Agrega tu <span class="highlight">Google Maps API Key</span> en <code style="color:#38bdf8;font-family:monospace;">app.js</code> (línea 1) para activar Directions API, Places API y Autocomplete en tiempo real.',
      '📋 Una vez configurada la key, completa el formulario con origen, destino, pasajeros y hora de llegada. El agente calculará la ruta real por carretera.',
    ], 1200);
    return;
  }

  /* Exponer callback GLOBALMENTE antes de inyectar el script
     Google Maps llama window.starsMapReady directamente */
  window.starsMapReady = onMapsReady;

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry&language=es&region=MX&callback=starsMapReady`;
  script.async = true; script.defer = true;
  script.onerror = () => {
    console.error('[S.T.A.R.S.] Error cargando Google Maps SDK.');
    addMessage('❌ Error al cargar Google Maps SDK. Verifica tu API Key y que las APIs estén habilitadas en Google Cloud Console.', 'alert-msg');
  };
  document.head.appendChild(script);
  startClock();
})();

/* ══════════════════════════════════════════════════════════════════
   2.  MAPS READY — Callback de Google Maps
   ══════════════════════════════════════════════════════════════════ */

function onMapsReady() {
  STATE.mapsLoaded = true;
  console.log('[S.T.A.R.S.] Google Maps SDK cargado correctamente.');

  /* Ocultar API notice PRIMERO antes de inicializar el mapa */
  const notice = document.getElementById('api-notice');
  notice.style.opacity = '0';
  setTimeout(() => notice.classList.add('hidden'), 400);

  /* Inicializar Map */
  STATE.map = new google.maps.Map(document.getElementById('map-container'), {
    zoom: 12,
    center: STARS_CONFIG.MAP_CENTER_DEFAULT,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  /* Forzar resize tras ocultar el notice para que Google Maps
     recalcule sus dimensiones correctamente */
  setTimeout(() => {
    google.maps.event.trigger(STATE.map, 'resize');
    STATE.map.setCenter(STARS_CONFIG.MAP_CENTER_DEFAULT);
  }, 450);

  /* Inicializar servicios */
  STATE.directionsService = new google.maps.DirectionsService();
  STATE.directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: '#38bdf8',
      strokeWeight: 5,
      strokeOpacity: 0.9,
    },
  });
  STATE.directionsRenderer.setMap(STATE.map);
  STATE.placesService = new google.maps.PlacesService(STATE.map);
  STATE.geocoder = new google.maps.Geocoder();

  /* Autocomplete */
  const acOptions = {
    componentRestrictions: { country: 'mx' },
    fields: ['formatted_address', 'geometry', 'name'],
    types: ['geocode', 'establishment'],
  };
  STATE.autocompleteOrigin = new google.maps.places.Autocomplete(
    document.getElementById('input-origin'), acOptions
  );
  STATE.autocompleteDest = new google.maps.places.Autocomplete(
    document.getElementById('input-dest'), acOptions
  );
  STATE.autocompleteOrigin.addListener('place_changed', () => {
    document.getElementById('origin-status').textContent = '✓';
    document.getElementById('origin-status').style.color = '#10b981';
  });
  STATE.autocompleteDest.addListener('place_changed', () => {
    document.getElementById('dest-status').textContent = '✓';
    document.getElementById('dest-status').style.color = '#10b981';
  });

  /* Saludo del agente */
  sendSequence([
    '🛰️ <strong class="orange">S.T.A.R.S. v3.0 MVP</strong> en línea. Conexión establecida con <span class="highlight">Google Maps Platform</span>.',
    '🗺️ Modules activos: <strong>Directions API</strong>, <strong>Places API</strong>, <strong>Geocoding API</strong>, <strong>Places Autocomplete</strong>.',
    '📋 Bienvenido. Por favor completa el formulario de la izquierda: <span class="highlight">origen</span>, <span class="highlight">destino</span>, pasajeros y hora de llegada requerida para iniciar la estandarización de la ruta operativa.',
  ], 1100);
}

/* ══════════════════════════════════════════════════════════════════
   3.  HANDLER PRINCIPAL
   ══════════════════════════════════════════════════════════════════ */

async function handleGenerate() {
  if (STATE.isProcessing) return;

  const origin    = document.getElementById('input-origin').value.trim();
  const dest      = document.getElementById('input-dest').value.trim();
  const passengers = parseInt(document.getElementById('input-passengers').value) || 24;
  const arrivalTime = document.getElementById('input-time').value;
  const fleetCount = parseInt(document.getElementById('input-fleet').value) || 3;

  if (!origin || !dest) {
    addMessage('⚠️ Detecto campos vacíos. Necesito tanto la <strong>dirección de inicio</strong> como la <strong>dirección de destino</strong> para iniciar el análisis de ruta.', 'thinking');
    showToast('⚠️ Completa origen y destino');
    return;
  }

  if (!STATE.mapsLoaded) {
    addMessage('⚠️ Google Maps SDK aún no disponible. Configura tu API Key en app.js línea 1 y recarga la página.', 'alert-msg');
    return;
  }

  /* UI: estado procesando */
  STATE.isProcessing = true;
  setProcessingUI(true);
  setStatus('SYSTEM: OPTIMIZANDO', '#f97316');
  document.getElementById('ft-system').textContent = 'PROCESANDO';
  document.getElementById('ft-api').textContent = 'ACTIVA';
  document.getElementById('sla-alert').classList.add('hidden');

  /* Limpiar mapa anterior */
  clearMapState();

  try {
    /* ── FASE 1: Geocodificación confirmada ── */
    setPhase(1);
    setProgress(15, 'Geocodificando direcciones...');
    addMessage(`🧠 Parámetros recibidos: <strong>${passengers} pasajeros</strong>, llegada requerida <strong>${arrivalTime}</strong>. Iniciando análisis de red vial...`);
    await wait(600);
    sendChat('📡 Conectando con <span class="highlight">Directions API</span> de Google Maps Platform... Analizando nodos de red vial para México.');

    /* ── FASE 2: Directions Service (ruta real) ── */
    setPhase(2);
    setProgress(35, 'Calculando ruta real por carretera...');
    await wait(400);

    const routeResult = await calcDirectionsRoute(origin, dest);
    const leg = routeResult.routes[0].legs[0];
    STATE.activeRoute = routeResult;
    STATE.routeDistance = leg.distance.value / 1000;       // km
    STATE.routeDurationSec = leg.duration_in_traffic
      ? leg.duration_in_traffic.value
      : leg.duration.value;                                // segundos

    STATE.directionsRenderer.setDirections(routeResult);

    /* Marcadores personalizados origen/destino */
    addOriginMarker(leg.start_location, origin);
    addDestMarker(leg.end_location, dest);

    const distKm = STATE.routeDistance.toFixed(1);
    const durMin = Math.round(STATE.routeDurationSec / 60);
    sendChat(`✅ <strong>Ruta real por carretera calculada.</strong> Distancia: <span class="highlight">${distKm} km</span> — Tiempo de tráfico: <span class="highlight">${durMin} min</span>. Polyline renderizado sobre calles reales.`);
    updateNavMetrics(distKm + ' km', durMin + ' min');

    /* ── FASE 3: Places API — Smart Stops ── */
    setPhase(3);
    setProgress(60, 'Buscando paradas inteligentes vía Places API...');
    await wait(300);
    sendChat(`🔍 Ejecutando <span class="highlight">PlacesService.nearbySearch()</span> — Radio: ${STARS_CONFIG.SMART_STOP_RADIUS_M / 1000} km alrededor del punto medio de la ruta real. Buscando: gasolineras + zonas comerciales.`);

    const midpoint = getRouteMidpoint(routeResult.routes[0].overview_path);
    await loadSmartStops(midpoint);

    /* ── FASE 4: Cálculo de KPIs de Negocio ── */
    setPhase(4);
    setProgress(80, 'Calculando KPIs — Ahorro, SLA...');
    await wait(400);
    sendChat('📊 Aplicando modelo de optimización de combustible <strong>S.T.A.R.S. Standard (12%)</strong> sobre distancia real de Directions API...');

    const kpis = calcBusinessKPIs(STATE.routeDistance, STATE.routeDurationSec, arrivalTime, passengers);
    // AQUÍ ESTÁ EL PUENTE DE LA VARIABLE arrivalTime CORREGIDO
    renderKPIs(kpis, STATE.routeDistance, arrivalTime);

    /* ── FASE 5: Simulación de Flota ── */
    setProgress(92, 'Desplegando unidades de flota...');
    await wait(300);
    const path = routeResult.routes[0].overview_path;
    deployFleet(fleetCount, path);
    sendChat(`🚌 Flota desplegada: <strong>${fleetCount} unidades</strong> activas en ruta. Marcadores dinámicos con coordenadas reales actualizando cada 3s.`);

    /* ── FASE 6: Evaluación SLA ── */
    setProgress(100, 'Estandarización completa.');
    await wait(400);
    evalSLA(kpis, arrivalTime);

    /* Mensaje final del agente */
    const slaIcon = kpis.slaMet ? '✅' : '⚠️';
    const slaText = kpis.slaMet
      ? `SLA cumplido. Llegada estimada dentro del margen operativo de <strong>${arrivalTime}</strong>.`
      : `<span style="color:#fca5a5;">ALERTA SLA: El tráfico actual añade ${kpis.slaOverflowMin} min sobre el horario requerido.</span>`;

    sendChat(
      `${slaIcon} <strong>Estandarización de ruta completada.</strong><br>` +
      `Ahorro estimado: <span class="orange">${kpis.fuelSavePct}%</span> — ` +
      `${kpis.fuelSaveLiters.toFixed(1)} L — $${kpis.fuelSaveMXN.toFixed(0)} MXN.<br>${slaText}`,
      kpis.slaMet ? 'success-msg' : 'alert-msg'
    );

    updateFooter(distKm, STATE.stopMarkers.length, fleetCount);
    setStatus('SYSTEM: MONITOREANDO', '#10b981');

  } catch (err) {
    console.error('[S.T.A.R.S.] Error:', err);
    addMessage(
      `❌ <strong>Error en el procesamiento:</strong> ${err.message || err}. Verifica que las direcciones sean válidas en México y que tu API Key tenga <strong>Directions API</strong> y <strong>Places API</strong> habilitadas.`,
      'alert-msg'
    );
    setStatus('SYSTEM: ERROR', '#ef4444');
  } finally {
    STATE.isProcessing = false;
    setProcessingUI(false);
    document.getElementById('ft-system').textContent = STATE.mapsLoaded ? 'ACTIVO' : 'IDLE';
  }
}

/* ══════════════════════════════════════════════════════════════════
   4.  DIRECTIONS API
   ══════════════════════════════════════════════════════════════════ */

function calcDirectionsRoute(origin, dest) {
  return new Promise((resolve, reject) => {
    STATE.directionsService.route({
      origin,
      destination: dest,
      travelMode: google.maps.TravelMode.DRIVING,
      region: STARS_CONFIG.DIRECTIONS_COUNTRY,
      language: 'es',
      drivingOptions: {
        departureTime: new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      },
      provideRouteAlternatives: false,
    }, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK) {
        resolve(result);
      } else {
        const errMsg = {
          ZERO_RESULTS:       'No se encontraron rutas entre esos puntos.',
          NOT_FOUND:          'Una o ambas direcciones no fueron encontradas.',
          MAX_WAYPOINTS_EXCEEDED: 'Demasiados puntos intermedios.',
          INVALID_REQUEST:    'Solicitud inválida.',
          OVER_DAILY_LIMIT:   'Límite diario de Directions API excedido.',
          OVER_QUERY_LIMIT:   'Demasiadas solicitudes. Espera un momento.',
          REQUEST_DENIED:     'Directions API no habilitada o Key inválida.',
          UNKNOWN_ERROR:      'Error desconocido en Directions API.',
        }[status] || `Error de Directions API: ${status}`;
        reject(new Error(errMsg));
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   5.  PLACES API — Smart Stops
   ══════════════════════════════════════════════════════════════════ */

async function loadSmartStops(midpoint) {
  const types = ['gas_station', 'shopping_mall', 'supermarket'];
  const labels = { gas_station: '⛽ Gasolinera', shopping_mall: '🏪 Plaza Comercial', supermarket: '🛒 Supermercado' };
  const colors = { gas_station: '#f97316', shopping_mall: '#38bdf8', supermarket: '#10b981' };

  const results = await Promise.allSettled(
    types.map(type => searchNearbyPlaces(midpoint, type))
  );

  let stopCount = 0;
  results.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value.length > 0) {
      const place = res.value[0]; // Tomar el primer resultado (más relevante)
      const type = types[i];
      placeSmartStop(place, labels[type], colors[type]);
      stopCount++;
    }
  });

  document.getElementById('ft-stops').textContent = stopCount;
  sendChat(`📍 <strong>Places API</strong> retornó <span class="highlight">${stopCount} paradas de suministro</span> dentro del radio de ${STARS_CONFIG.SMART_STOP_RADIUS_M / 1000} km: gasolinera, zona comercial y punto de abastecimiento.`);
}

function searchNearbyPlaces(location, type) {
  return new Promise((resolve) => {
    const request = {
      location,
      radius: STARS_CONFIG.SMART_STOP_RADIUS_M,
      type,
      language: 'es',
      rankBy: google.maps.places.RankBy.PROMINENCE,
    };
    STATE.placesService.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        resolve(results);
      } else {
        resolve([]); // No bloquear si falla un tipo
      }
    });
  });
}

function placeSmartStop(place, label, color) {
  const position = place.geometry.location;

  /* Marcador SVG personalizado */
  const svgMarker = {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 1.5,
    scale: 1.4,
    anchor: new google.maps.Point(12, 22),
  };

  const marker = new google.maps.Marker({
    position,
    map: STATE.map,
    icon: svgMarker,
    title: `${label} — ${place.name}`,
    animation: google.maps.Animation.DROP,
  });

  // ETIQUETAS PARA QUE LOS CAMIONES LAS DETECTEN
  marker.isSmartStop = true; 
  marker.placeName = place.name;

  /* InfoWindow estilizado */
  const rating = place.rating ? `⭐ ${place.rating}` : '';
  const infoContent = `
    <div style="font-family:'Space Grotesk',sans-serif;min-width:180px;padding:4px 0;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:4px;">${label}</div>
      <div style="font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:3px;">${place.name}</div>
      <div style="font-size:11px;color:#94a3b8;">${place.vicinity || ''}</div>
      ${rating ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px;">${rating}</div>` : ''}
      <div style="font-size:9px;color:#475569;margin-top:6px;font-weight:700;letter-spacing:0.06em;">PARADA RECOMENDADA S.T.A.R.S.</div>
    </div>`;

  const iw = new google.maps.InfoWindow({ content: infoContent, maxWidth: 240 });
  marker.addListener('click', () => {
    STATE.infoWindows.forEach(w => w.close());
    iw.open(STATE.map, marker);
  });

  STATE.stopMarkers.push(marker);
  STATE.infoWindows.push(iw);
}

/* ══════════════════════════════════════════════════════════════════
   6.  MARCADORES PERSONALIZADOS — Origen / Destino
   ══════════════════════════════════════════════════════════════════ */

function addOriginMarker(position, label) {
  const marker = new google.maps.Marker({
    position, map: STATE.map,
    title: 'Origen: ' + label,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#10b981', fillOpacity: 1,
      strokeColor: '#fff', strokeWeight: 2,
    },
    zIndex: 100,
    animation: google.maps.Animation.DROP,
  });

  const iw = new google.maps.InfoWindow({
    content: `<div style="font-family:'Space Grotesk',sans-serif;padding:2px 0;">
      <div style="font-size:9px;font-weight:700;color:#10b981;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">● ORIGEN</div>
      <div style="font-size:12px;color:#f1f5f9;">${label}</div>
    </div>`,
    maxWidth: 220,
  });
  marker.addListener('click', () => {
    STATE.infoWindows.forEach(w => w.close());
    iw.open(STATE.map, marker);
  });
  STATE.stopMarkers.push(marker);
  STATE.infoWindows.push(iw);
}

function addDestMarker(position, label) {
  const marker = new google.maps.Marker({
    position, map: STATE.map,
    title: 'Destino: ' + label,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#f97316', fillOpacity: 1,
      strokeColor: '#fff', strokeWeight: 2,
    },
    zIndex: 100,
    animation: google.maps.Animation.DROP,
  });

  const iw = new google.maps.InfoWindow({
    content: `<div style="font-family:'Space Grotesk',sans-serif;padding:2px 0;">
      <div style="font-size:9px;font-weight:700;color:#f97316;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">◉ DESTINO</div>
      <div style="font-size:12px;color:#f1f5f9;">${label}</div>
    </div>`,
    maxWidth: 220,
  });
  marker.addListener('click', () => {
    STATE.infoWindows.forEach(w => w.close());
    iw.open(STATE.map, marker);
  });
  STATE.stopMarkers.push(marker);
  STATE.infoWindows.push(iw);
}

/* ══════════════════════════════════════════════════════════════════
   7.  SIMULACIÓN DE FLOTA — Múltiples Camiones
   ══════════════════════════════════════════════════════════════════ */

function deployFleet(count, routePath) {
  clearFleetMarkers();
  const fleetEl = document.getElementById('fleet-units');
  fleetEl.innerHTML = '';
  document.getElementById('fleet-count').textContent = `${count} unidades`;
  document.getElementById('nm-fleet').textContent = count;
  document.getElementById('ft-units').textContent = count;

  const busColors = ['#f97316', '#38bdf8', '#10b981', '#f59e0b', '#a78bfa', '#fb7185', '#34d399', '#60a5fa'];
  const statuses = ['EN RUTA', 'EN RUTA', 'EN ESPERA'];

  for (let i = 0; i < count; i++) {
    const pathIndex = Math.floor((routePath.length / count) * i);
    const basePos = routePath[Math.min(pathIndex, routePath.length - 1)];
    const spread = STARS_CONFIG.FLEET_SPREAD_KM;
    let lat = basePos.lat() + (Math.random() - 0.5) * spread;
    let lng = basePos.lng() + (Math.random() - 0.5) * spread;
    const pos = { lat, lng };

    const unitId = `TRX-${String(i + 1).padStart(3, '0')}`;
    const color  = busColors[i % busColors.length];
    let status = statuses[i % statuses.length];

    const busSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect x="2" y="7" width="28" height="18" rx="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <rect x="5" y="10" width="8" height="6" rx="1.5" fill="rgba(255,255,255,0.25)"/>
        <rect x="19" y="10" width="8" height="6" rx="1.5" fill="rgba(255,255,255,0.25)"/>
        <circle cx="8" cy="26" r="3" fill="#1e293b" stroke="${color}" stroke-width="1.5"/>
        <circle cx="24" cy="26" r="3" fill="#1e293b" stroke="${color}" stroke-width="1.5"/>
        <text x="16" y="20" font-family="monospace" font-size="6" font-weight="700" fill="white" text-anchor="middle">${unitId}</text>
      </svg>`;

    const baseIcon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(busSVG),
      scaledSize: new google.maps.Size(32, 32),
      anchor: new google.maps.Point(16, 32),
    };

    const marker = new google.maps.Marker({
      position: pos,
      map: STATE.map,
      title: unitId,
      icon: baseIcon,
      zIndex: 50 + i,
    });

    const iw = new google.maps.InfoWindow({
      content: `<div style="font-family:'Space Grotesk',sans-serif;min-width:160px;padding:2px 0;">
        <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:4px;">UNIDAD TRAXION</div>
        <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">${unitId}</div>
        <div style="font-size:10px;color:#94a3b8;">Estado actual de operación</div>
      </div>`,
      maxWidth: 200,
    });

    marker.addListener('click', () => {
      STATE.infoWindows.forEach(w => w.close());
      iw.open(STATE.map, marker);
    });

    const unitEl = document.createElement('div');
    unitEl.className = 'fleet-unit';
    unitEl.innerHTML = `
      <div class="unit-dot" style="background:${color};box-shadow:0 0 6px ${color}66;"></div>
      <div class="unit-id">${unitId}</div>
      <div class="unit-status ${status === 'EN RUTA' ? 'en-ruta' : 'en-espera'}" id="status-${unitId}">${status}</div>
      <div class="unit-coords" id="coords-${unitId}">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>`;
    
    unitEl.addEventListener('click', () => {
      STATE.map.panTo(marker.getPosition());
      STATE.map.setZoom(15);
      STATE.infoWindows.forEach(w => w.close());
      iw.open(STATE.map, marker);
    });
    fleetEl.appendChild(unitEl);

    // LÓGICA DE MOVIMIENTO CORREGIDA CON COOLDOWN
    let pathIdx = Math.floor((routePath.length / count) * i);
    const speed = 1; 
    let isStopped = false;
    let stopTicks = 0;
    let cooldownTicks = 0; // Escudo temporal

    const animInterval = setInterval(() => {
      if (STATE.isProcessing) return;

      const domStatus = document.getElementById(`status-${unitId}`);
      const domCoords = document.getElementById(`coords-${unitId}`);

      if (isStopped) {
        stopTicks--;
        if (stopTicks <= 0) {
          isStopped = false;
          cooldownTicks = 15; // Otorga 15 ticks de inmunidad para salir del radio de 300m
          status = 'EN RUTA';
          if (domStatus) {
            domStatus.textContent = status;
            domStatus.className = 'unit-status en-ruta';
          }
        }
        return; 
      }

      // Reducir el cooldown si está activo
      if (cooldownTicks > 0) cooldownTicks--;

      // Mover el camión
      pathIdx = (pathIdx + speed) % routePath.length;
      const cur = routePath[pathIdx];
      lat = cur.lat();
      lng = cur.lng();
      marker.setPosition(cur);

      if (domCoords) domCoords.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      // Comprobar paradas cercanas SOLO si no tiene el escudo activo
      if (cooldownTicks === 0 && STATE.stopMarkers) {
        const smartStops = STATE.stopMarkers.filter(m => m.isSmartStop);
        for (const stop of smartStops) {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(cur, stop.getPosition());
          
          if (dist < 300) {
            isStopped = true;
            stopTicks = 5; 
            status = 'EN PARADA';
            if (domStatus) {
              domStatus.textContent = status;
              domStatus.className = 'unit-status en-espera';
            }
            break; 
          }
        }
      }
    }, 800);

    STATE.fleetMarkers.push({ marker, animInterval, unitId, color, status });
    STATE.infoWindows.push(iw);
  }
}

function clearFleetMarkers() {
  STATE.fleetMarkers.forEach(({ marker, animInterval }) => {
    clearInterval(animInterval);
    marker.setMap(null);
  });
  STATE.fleetMarkers = [];
}

/* ══════════════════════════════════════════════════════════════════
   8.  LÓGICA DE NEGOCIO — KPIs Reales
   ══════════════════════════════════════════════════════════════════ */

function calcBusinessKPIs(distKm, durationSec, arrivalTimeStr, passengers) {
  /* ── Ahorro de Combustible ── */
  const totalFuelL         = distKm * STARS_CONFIG.FUEL_CONSUMPTION_L_PER_KM;
  const fuelSaveLiters     = totalFuelL * STARS_CONFIG.FUEL_OPTIMIZATION_FACTOR;
  const fuelSavePct        = (STARS_CONFIG.FUEL_OPTIMIZATION_FACTOR * 100).toFixed(0);
  const fuelSaveMXN        = fuelSaveLiters * STARS_CONFIG.FUEL_PRICE_MXN;
  const optimizedFuelL     = totalFuelL - fuelSaveLiters;

  /* ── SLA Evaluation ── */
  const durMin = Math.round(durationSec / 60);
  const now = new Date();
  const [reqH, reqM] = arrivalTimeStr.split(':').map(Number);
  const requiredArrival = new Date(now);
  requiredArrival.setHours(reqH, reqM, 0, 0);

  /* Si la hora requerida es antes de ahora, asumimos que es del día siguiente */
  if (requiredArrival <= now) requiredArrival.setDate(requiredArrival.getDate() + 1);

  const availableMin   = Math.round((requiredArrival - now) / 60000);
  const slaMarginMin   = availableMin - durMin;
  const slaMet         = slaMarginMin >= 0;
  const slaOverflowMin = slaMet ? 0 : Math.abs(slaMarginMin);
  const slaPct         = slaMet
    ? Math.min(100, Math.round((1 - (durMin / availableMin)) * 100 + 85))
    : Math.max(30, Math.round((availableMin / durMin) * 80));

  /* ── Per-passenger savings ── */
  const savingsPerPax = passengers > 0 ? (fuelSaveMXN / passengers) : 0;

  return {
    /* Fuel */
    fuelSavePct, fuelSaveLiters, fuelSaveMXN, totalFuelL, optimizedFuelL,
    /* Time */
    durMin, distKm,
    /* SLA */
    slaMet, slaPct, slaOverflowMin, availableMin, slaMarginMin,
    /* Pax */
    savingsPerPax,
  };
}

// AQUÍ SE CORRIGIÓ LA RECEPCIÓN DEL PARÁMETRO arrivalTime
function renderKPIs(kpis, distKm, arrivalTime) {
  /* Fuel KPI */
  document.getElementById('kpi-fuel').textContent = kpis.fuelSavePct + '%';
  document.getElementById('kpi-fuel-detail').textContent =
    `${kpis.fuelSaveLiters.toFixed(1)} L ahorrado — $${kpis.fuelSaveMXN.toFixed(0)} MXN`;
  document.getElementById('kpi-fuel-formula').textContent =
    `${distKm.toFixed(1)} km × ${STARS_CONFIG.FUEL_CONSUMPTION_L_PER_KM} L/km × 12% opt.`;
  setTimeout(() => {
    document.getElementById('fuel-bar').style.width = kpis.fuelSavePct + '%';
  }, 200);

  /* Time KPI */
  const durLabel = kpis.durMin >= 60
    ? `${Math.floor(kpis.durMin / 60)}h ${kpis.durMin % 60}min`
    : `${kpis.durMin} min`;
  document.getElementById('kpi-time').textContent = durLabel;
  document.getElementById('kpi-time-detail').textContent = `Tráfico actual — Directions API`;
  setTimeout(() => {
    document.getElementById('time-bar').style.width = Math.min(90, kpis.durMin * 1.2) + '%';
  }, 200);

  /* SLA KPI */
  const slaEl = document.getElementById('kpi-sla');
  slaEl.textContent = kpis.slaPct + '%';
  slaEl.className = 'kpi-value ' + (kpis.slaMet ? 'green' : 'red');

  const slaDetailText = kpis.slaMet
    ? `Margen: +${kpis.slaMarginMin} min — Cumplimiento garantizado`
    : `Excede por ${kpis.slaOverflowMin} min — ALERTA CRÍTICA`;
  document.getElementById('kpi-sla-detail').textContent = slaDetailText;

  const slaBarEl = document.getElementById('sla-bar');
  slaBarEl.className = `kpi-bar-fill ${kpis.slaMet ? 'green-fill' : 'red-fill'}`;
  setTimeout(() => { slaBarEl.style.width = kpis.slaPct + '%'; }, 200);

  /* Navbar */
  document.getElementById('ft-dist').textContent = distKm.toFixed(1) + ' km';
  
  /* ── CÁLCULO DE HORA DE SALIDA IDEAL ── */
  // Asumimos 15 minutos de receso por cada parada inteligente encontrada
  const smartStopsCount = STATE.stopMarkers.filter(m => m.isSmartStop).length;
  const estStopDurationMin = smartStopsCount * 15; 
  const totalTripMin = kpis.durMin + estStopDurationMin;

  const [reqH, reqM] = arrivalTime.split(':').map(Number);
  const arrivalDate = new Date();
  arrivalDate.setHours(reqH, reqM, 0, 0);
  // Si la hora requerida ya pasó hoy, asumimos que es para mañana
  if (arrivalDate <= new Date()) arrivalDate.setDate(arrivalDate.getDate() + 1);

  // Restamos el tiempo de viaje y paradas a la hora de llegada
  const idealDepDate = new Date(arrivalDate.getTime() - totalTripMin * 60000);
  const idealDepStr = `${String(idealDepDate.getHours()).padStart(2,'0')}:${String(idealDepDate.getMinutes()).padStart(2,'0')}`;

  sendChat(
    `🕒 <strong>Planificación de Salida:</strong> Para cumplir con la llegada a las ${arrivalTime}, sugerimos una <strong>Hora de Salida Ideal a las <span class="highlight">${idealDepStr}</span></strong>.<br><br><span style="font-size:10px;color:var(--text-muted);">Contempla ${kpis.durMin} min de ruta + ${estStopDurationMin} min de abastecimiento programado.</span>`,
    'thinking'
  );
}

function evalSLA(kpis, arrivalTime) {
  const alertEl = document.getElementById('sla-alert');
  if (!kpis.slaMet) {
    alertEl.classList.remove('hidden');
    document.getElementById('sla-alert-text').textContent =
      `⚠️ ALERTA SLA: El tráfico actual excede ${kpis.slaOverflowMin} min el horario requerido de ${arrivalTime}. Considera salir más temprano o ajustar la ruta.`;

    /* Chat alert */
    sendChat(
      `🚨 <strong>ALERTA CRÍTICA DE SLA:</strong> El tiempo real de tráfico (<span class="highlight">${kpis.durMin} min</span>) supera en <strong style="color:#fca5a5;">${kpis.slaOverflowMin} minutos</strong> el horario de llegada requerido (${arrivalTime}). Recomendación: adelantar salida o evaluar ruta alternativa.`,
      'alert-msg'
    );
  } else {
    alertEl.classList.add('hidden');
    sendChat(
      `✅ <strong>SLA Cumplido.</strong> Margen disponible: <span class="highlight">+${kpis.slaMarginMin} min</span> sobre el horario requerido de ${arrivalTime}. Operación dentro de parámetros.`,
      'success-msg'
    );
  }
}

/* ══════════════════════════════════════════════════════════════════
   9.  UTILIDADES DE MAPA
   ══════════════════════════════════════════════════════════════════ */

function getRouteMidpoint(path) {
  const mid = Math.floor(path.length / 2);
  return path[mid];
}

function clearMapState() {
  /* Limpiar marcadores */
  STATE.stopMarkers.forEach(m => m.setMap(null));
  STATE.stopMarkers = [];
  STATE.infoWindows.forEach(w => w.close());
  STATE.infoWindows = [];
  clearFleetMarkers();

  /* Limpiar directions */
  if (STATE.directionsRenderer) {
    STATE.directionsRenderer.setDirections({ routes: [] });
  }

  /* Reset KPIs */
  ['kpi-fuel', 'kpi-time', 'kpi-sla'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  ['kpi-fuel-detail', 'kpi-time-detail', 'kpi-sla-detail'].forEach(id => {
    document.getElementById(id).textContent = '...';
  });
  ['fuel-bar', 'time-bar', 'sla-bar'].forEach(id => {
    document.getElementById(id).style.width = '0%';
  });
  document.getElementById('kpi-fuel-formula').textContent = '';
  document.getElementById('fleet-units').innerHTML = '';
  document.getElementById('fleet-count').textContent = '0 unidades';
}

/* ══════════════════════════════════════════════════════════════════
   10. CHAT ENGINE
   ══════════════════════════════════════════════════════════════════ */

function formatTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}

function addMessage(html, bubbleClass = '') {
  const chatEl = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-body">
      <div class="msg-name">S.T.A.R.S. AGENT</div>
      <div class="msg-bubble ${bubbleClass}">${html}</div>
      <div class="msg-time">${formatTime()}</div>
    </div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;

  STATE.msgCount++;
  document.getElementById('msg-count').textContent = STATE.msgCount > 99 ? '99+' : STATE.msgCount;
}

function sendChat(html, bubbleClass = '') {
  addMessage(html, bubbleClass);
}

function showTyping() {
  removeTyping();
  const chatEl = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg'; div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-body">
      <div class="msg-name">S.T.A.R.S. AGENT</div>
      <div class="msg-bubble thinking">
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function sendSequence(messages, delayMs = 1200) {
  let i = 0;
  function next() {
    if (i >= messages.length) return;
    removeTyping();
    const [html, cls] = Array.isArray(messages[i]) ? messages[i] : [messages[i], ''];
    addMessage(html, cls);
    i++;
    if (i < messages.length) {
      showTyping();
      setTimeout(next, delayMs + Math.random() * 300);
    }
  }
  showTyping();
  setTimeout(next, 600);
}

/* ══════════════════════════════════════════════════════════════════
   11. UI HELPERS
   ══════════════════════════════════════════════════════════════════ */

function setProcessingUI(on) {
  const btn = document.getElementById('btn-generate');
  const pw  = document.getElementById('progress-wrap');
  btn.disabled = on;
  btn.innerHTML = on
    ? '<svg class="btn-svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg> Procesando...'
    : '<svg class="btn-svg" viewBox="0 0 24 24" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Generar Estructura de Ruta';
  pw.style.display = on ? 'block' : 'none';
  if (!on) {
    setProgress(0, '');
    resetPhases();
  }
}

function setProgress(pct, label) {
  document.getElementById('progress-bar').style.width = pct + '%';
}

const PHASE_STEPS = { 1: 25, 2: 50, 3: 75, 4: 100 };
function setPhase(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`ph-${i}`);
    if (!el) continue;
    if (i < n) el.className = 'phase done';
    else if (i === n) el.className = 'phase active';
    else el.className = 'phase';
  }
}
function resetPhases() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`ph-${i}`);
    if (el) el.className = 'phase';
  }
}

function setStatus(text, color = '#10b981') {
  document.getElementById('status-text').textContent = text;
  document.getElementById('status-pill').style.color = color;
  document.getElementById('status-pill').style.borderColor = color + '33';
  document.getElementById('pulse-dot').style.background = color;
}

function updateNavMetrics(dist, eta) {
  document.getElementById('nm-distance').textContent = dist;
  document.getElementById('nm-eta').textContent = eta;
}

function updateFooter(distKm, stops, fleet) {
  document.getElementById('ft-dist').textContent = distKm + ' km';
  document.getElementById('ft-stops').textContent = stops;
  document.getElementById('ft-units').textContent = fleet;
  document.getElementById('ft-ticker').textContent =
    '✅ RUTA ESTANDARIZADA — S.T.A.R.S. MVP — TRAXION LOGISTICS INTELLIGENCE — FLEET ACTIVA';
}

function showToast(msg) {
  /* Implementación mínima via console; puede extenderse */
  console.info('[S.T.A.R.S. Toast]', msg);
}

/* ══════════════════════════════════════════════════════════════════
   12. RELOJ
   ══════════════════════════════════════════════════════════════════ */

function startClock() {
  function tick() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('clock').textContent =
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  tick();
  setInterval(tick, 1000);
}

/* ── Telemetría de latencia simulada en footer ── */
setInterval(() => {
  const el = document.getElementById('ft-api');
  if (el && el.textContent === 'ACTIVA') {
    // No tocar
  }
}, 3000);

/* ══════════════════════════════════════════════════════════════════
   13. NAMESPACE PÚBLICO — expuesto al HTML
   ══════════════════════════════════════════════════════════════════ */

window.STARS = {
  handleGenerate,
  onMapsReady,
};

/* ══════════════════════════════════════════════════════════════════
   14. DARK MAP STYLE (Google Maps JSON)
   ══════════════════════════════════════════════════════════════════ */

const DARK_MAP_STYLE = [
  { elementType: 'geometry',           stylers: [{ color: '#080d17' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#080d17' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#475569' }] },
  { featureType: 'road',
    elementType: 'geometry',           stylers: [{ color: '#1e293b' }] },
  { featureType: 'road',
    elementType: 'geometry.stroke',    stylers: [{ color: '#0f172a' }] },
  { featureType: 'road',
    elementType: 'labels.text.fill',   stylers: [{ color: '#64748b' }] },
  { featureType: 'road.highway',
    elementType: 'geometry',           stylers: [{ color: '#253347' }] },
  { featureType: 'road.highway',
    elementType: 'geometry.stroke',    stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway',
    elementType: 'labels.text.fill',   stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road.arterial',
    elementType: 'labels.text.fill',   stylers: [{ color: '#64748b' }] },
  { featureType: 'administrative',
    elementType: 'geometry.stroke',    stylers: [{ color: '#1e293b' }] },
  { featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',   stylers: [{ color: '#334155' }] },
  { featureType: 'poi',
    stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',
    elementType: 'geometry',           stylers: [{ color: '#0c1a1a' }] },
  { featureType: 'poi.park',
    elementType: 'labels.text.fill',   stylers: [{ color: '#1e3a2a' }] },
  { featureType: 'transit',
    stylers: [{ visibility: 'off' }] },
  { featureType: 'water',
    elementType: 'geometry',           stylers: [{ color: '#050b14' }] },
  { featureType: 'water',
    elementType: 'labels.text.fill',   stylers: [{ color: '#1e3a5f' }] },
];

/* ── Await helper ── */
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }