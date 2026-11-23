var services = loadStoredServices();
var reviews = loadStoredReviews();
var reviewedServiceIds = loadReviewedServiceIds();
var currentRadius = 25;
var currentCategory = 'todos';
var searchQuery = '';
var currentPage = 1;
var itemsPerPage = 6;
var DEFAULT_LOCATION = { lat: -5.0892, lng: -42.8016 };
var userLocation = { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
var serviceMap = null;
var serviceMarkers = null;
var userMarker = null;
var radiusCircle = null;
var highlightedServiceId = null;
var hasExactUserLocation = false;
var activeReviewServiceId = null;
var useFallbackMap = window.location.protocol === 'file:';
var CATEGORY_ICONS = {
  'assistencia-tecnica': '💻',
  'lavanderia': '👕',
  'confeitaria-decoradores': '🎂',
  'eletricista': '⚡',
  'encanador': '🔧',
  'chaveiro': '🔑',
  'mecanico': '🚗',
  'guincho': '🚚',
  'gas': '🔥',
  'outros': '📌'
};

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.outros;
}

function loadStoredServices() {
  try {
    var stored = JSON.parse(localStorage.getItem('facilita_ai_services'));
    if (!Array.isArray(stored)) return INITIAL_DATA.slice();
    return stored.map(function(service) {
      var defaults = INITIAL_DATA.find(function(item) { return item.id === service.id; });
      return defaults ? Object.assign({}, defaults, service) : service;
    });
  } catch (error) {
    return INITIAL_DATA.slice();
  }
}

function loadStoredReviews() {
  try {
    var stored = JSON.parse(localStorage.getItem('facilita_ai_reviews'));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function loadReviewedServiceIds() {
  try {
    var stored = JSON.parse(localStorage.getItem('facilita_ai_reviewed_services'));
    return stored && typeof stored === 'object' ? stored : {};
  } catch (error) {
    return {};
  }
}

function saveReviewsLocally() {
  try {
    localStorage.setItem('facilita_ai_reviews', JSON.stringify(reviews));
    localStorage.setItem('facilita_ai_reviewed_services', JSON.stringify(reviewedServiceIds));
  } catch (error) {}
}

// Toast helper replacing window.alert (safe in sandboxes)
function showToast(msg) {
  var toast = document.getElementById('toastContainer');
  var text = document.getElementById('toastText');
  if (!toast || !text) return;
  text.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() {
    toast.classList.remove('show');
  }, 4500);
}

// Mobile menu toggle
function toggleMobileMenu(force) {
  var dropdown = document.getElementById('mobileDropdown');
  if (!dropdown) return;
  if (typeof force === 'boolean') {
    dropdown.classList.toggle('open', force);
  } else {
    dropdown.classList.toggle('open');
  }
}

// Geolocation upon entry
window.addEventListener('DOMContentLoaded', function() {
  setupPhoneMasks();
  setupCepLookups();
  initMap();
  requestLocation();
  renderAll();
  listenFirestore();
  listenReviews();
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeReviews();
  });
});

function formatPhone(value) {
  var digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return '(' + digits;

  var areaCode = digits.slice(0, 2);
  var number = digits.slice(2);

  if (number.length <= 4) {
    return '(' + areaCode + ') ' + number;
  }

  if (number.length <= 8) {
    return '(' + areaCode + ') ' + number.slice(0, 4) + '-' + number.slice(4);
  }

  return '(' + areaCode + ') ' + number.slice(0, 5) + '-' + number.slice(5);
}

function setupPhoneMasks() {
  document.querySelectorAll('input[type="tel"]').forEach(function(input) {
    input.addEventListener('input', function() {
      input.value = formatPhone(input.value);
    });
  });
}

function formatCep(value) {
  var digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
}

function setCepStatus(prefix, message, type) {
  var status = document.getElementById(prefix + 'cep-status');
  if (!status) return;
  status.textContent = message;
  status.className = 'field-hint' + (type ? ' ' + type : '');
}

function fillAddress(prefix, address) {
  document.getElementById(prefix + 'street').value = address.street || '';
  document.getElementById(prefix + 'neighborhood').value = address.neighborhood || '';
  document.getElementById(prefix + 'city').value = address.city || '';
  document.getElementById(prefix + 'state').value = (address.state || '').toUpperCase();
  document.getElementById(prefix + 'latitude').value = address.latitude || '';
  document.getElementById(prefix + 'longitude').value = address.longitude || '';
}

async function fetchAddressByCep(cep) {
  try {
    var brasilApiResponse = await fetch('https://brasilapi.com.br/api/cep/v2/' + cep);
    if (!brasilApiResponse.ok) throw new Error('CEP não encontrado');
    var brasilApiData = await brasilApiResponse.json();
    var coordinates = brasilApiData.location && brasilApiData.location.coordinates
      ? brasilApiData.location.coordinates
      : {};

    return {
      street: brasilApiData.street,
      neighborhood: brasilApiData.neighborhood,
      city: brasilApiData.city,
      state: brasilApiData.state,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    };
  } catch (primaryError) {
    var viaCepResponse = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    if (!viaCepResponse.ok) throw primaryError;
    var viaCepData = await viaCepResponse.json();
    if (viaCepData.erro) throw new Error('CEP não encontrado');

    return {
      street: viaCepData.logradouro,
      neighborhood: viaCepData.bairro,
      city: viaCepData.localidade,
      state: viaCepData.uf,
      latitude: '',
      longitude: ''
    };
  }
}

async function lookupCep(prefix) {
  var cepInput = document.getElementById(prefix + 'cep');
  var cep = cepInput.value.replace(/\D/g, '');
  if (cep.length !== 8) {
    setCepStatus(prefix, 'Informe um CEP com 8 números.', 'error');
    return;
  }

  setCepStatus(prefix, 'Buscando endereço...', 'loading');
  try {
    var address = await fetchAddressByCep(cep);
    fillAddress(prefix, address);
    setCepStatus(prefix, address.latitude ? 'Endereço e localização encontrados.' : 'Endereço encontrado.', 'success');
    document.getElementById(prefix + 'number').focus();
  } catch (error) {
    fillAddress(prefix, {});
    setCepStatus(prefix, 'CEP não encontrado. Confira e tente novamente.', 'error');
  }
}

function setupCepLookups() {
  document.querySelectorAll('.cep-input').forEach(function(input) {
    input.addEventListener('input', function() {
      input.value = formatCep(input.value);
      document.getElementById(input.dataset.prefix + 'latitude').value = '';
      document.getElementById(input.dataset.prefix + 'longitude').value = '';
      if (input.value.replace(/\D/g, '').length < 8) {
        setCepStatus(input.dataset.prefix, 'Digite o CEP para preencher o endereço.', '');
      }
    });
    input.addEventListener('blur', function() {
      if (input.value.replace(/\D/g, '').length === 8) lookupCep(input.dataset.prefix);
    });
  });
  document.querySelectorAll('.state-input').forEach(function(input) {
    input.addEventListener('input', function() {
      input.value = input.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
    });
  });
}

function initMap() {
  var mapElement = document.getElementById('mapCanvas');
  if (!mapElement) return;

  if (useFallbackMap || typeof L === 'undefined') {
    useFallbackMap = true;
    initFallbackMap(mapElement);
    return;
  }

  serviceMap = L.map('mapCanvas').setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(serviceMap);
  serviceMarkers = L.layerGroup().addTo(serviceMap);

  var LocateControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function() {
      var button = L.DomUtil.create('button', 'locate-control');
      button.type = 'button';
      button.title = 'Voltar para minha localização atual';
      button.setAttribute('aria-label', 'Voltar para minha localização atual');
      button.innerHTML = '⌖ <span>Minha localização</span>';
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, 'click', function(event) {
        L.DomEvent.preventDefault(event);
        centerOnCurrentLocation();
      });
      return button;
    }
  });
  new LocateControl().addTo(serviceMap);

  updateUserMarker(false);
  updateRadiusCircle();
}

function initFallbackMap(mapElement) {
  mapElement.replaceChildren();
  mapElement.classList.add('fallback-map');

  var headerDescription = document.querySelector('.map-title-box span');
  if (headerDescription) headerDescription.textContent = 'Visualização aproximada — abra por servidor para usar o mapa real';

  var grid = document.createElement('div');
  grid.className = 'fallback-grid';
  var outerCircle = document.createElement('div');
  outerCircle.className = 'fallback-circle fallback-circle-outer';
  var innerCircle = document.createElement('div');
  innerCircle.className = 'fallback-circle fallback-circle-inner';

  var locateButton = document.createElement('button');
  locateButton.type = 'button';
  locateButton.className = 'fallback-locate';
  locateButton.textContent = '⌖ Minha localização';
  locateButton.addEventListener('click', centerOnCurrentLocation);

  var modeBadge = document.createElement('div');
  modeBadge.className = 'fallback-mode-badge';
  modeBadge.textContent = 'Mapa ilustrativo';

  var user = document.createElement('div');
  user.className = 'fallback-user';
  var userDot = document.createElement('div');
  userDot.className = 'fallback-user-dot';
  var userLabel = document.createElement('div');
  userLabel.className = 'fallback-user-label';
  userLabel.textContent = 'Você está aqui';
  user.appendChild(userDot);
  user.appendChild(userLabel);

  var pins = document.createElement('div');
  pins.id = 'fallbackPins';
  var popover = document.createElement('div');
  popover.id = 'fallbackPopover';
  popover.className = 'fallback-popover hidden';

  mapElement.appendChild(grid);
  mapElement.appendChild(outerCircle);
  mapElement.appendChild(innerCircle);
  mapElement.appendChild(locateButton);
  mapElement.appendChild(modeBadge);
  mapElement.appendChild(user);
  mapElement.appendChild(pins);
  mapElement.appendChild(popover);
}

function updateUserMarker(isExact) {
  if (!serviceMap) return;
  if (userMarker) serviceMap.removeLayer(userMarker);
  var icon = L.divIcon({ className: '', html: '<div class="user-location-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: icon, zIndexOffset: 1000 })
    .addTo(serviceMap)
    .bindTooltip(isExact ? 'Você está aqui' : 'Localização de referência', { direction: 'top' });
}

function updateRadiusCircle() {
  if (!serviceMap) return;
  if (radiusCircle) serviceMap.removeLayer(radiusCircle);
  if (currentRadius === 999) return;
  radiusCircle = L.circle([userLocation.lat, userLocation.lng], {
    radius: currentRadius * 1000,
    color: '#39C6A5',
    fillColor: '#39C6A5',
    fillOpacity: 0.07,
    weight: 2
  }).addTo(serviceMap);
}

function locateCurrentUser(isManual) {
  if (!navigator.geolocation) {
    document.getElementById('loc-text').textContent = 'Padrão (Teresina - PI)';
    if (isManual) showToast('A localização não está disponível neste navegador.');
    return;
  }

  if (isManual) showToast('📍 Buscando sua localização atual...');
  navigator.geolocation.getCurrentPosition(function(pos) {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    hasExactUserLocation = true;
    document.getElementById('loc-text').textContent = 'Ativa (Lat: ' + pos.coords.latitude.toFixed(2) + ', Lng: ' + pos.coords.longitude.toFixed(2) + ')';
    if (serviceMap) serviceMap.setView([userLocation.lat, userLocation.lng], 14);
    updateUserMarker(true);
    updateRadiusCircle();
    renderAll();
    showToast(isManual ? '📍 Mapa centralizado na sua localização.' : '📍 Localização detectada! Mostrando profissionais por raio.');
  }, function() {
    if (!hasExactUserLocation) document.getElementById('loc-text').textContent = 'Padrão (Teresina - PI)';
    if (isManual) showToast('Não foi possível acessar sua localização. Verifique a permissão do navegador.');
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000
  });
}

function centerOnCurrentLocation() {
  locateCurrentUser(true);
}

function requestLocation() {
  locateCurrentUser(false);
}

function listenFirestore() {
  if (!window.cloud) return;
  try {
    window.cloud.onServices(function(snap) {
      var cloudItems = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        cloudItems.push({
          id: doc.id,
          name: d.name,
          category: d.category || 'outros',
          icon: getCategoryIcon(d.category || 'outros'),
          dist: d.distanceKm || 1.2,
          neighborhood: d.neighborhood || 'Centro',
          city: d.city || 'Teresina - PI',
          state: d.state || '',
          cep: d.cep || '',
          street: d.street || '',
          number: d.number || '',
          complement: d.complement || '',
          latitude: Number(d.latitude),
          longitude: Number(d.longitude),
          phone: d.phone || '',
          whatsapp: d.whatsapp || d.phone || '',
          desc: d.description || '',
          status: d.status || 'Disponível para contato'
        });
      });
      if (cloudItems.length > 0) {
        var combined = services.slice();
        cloudItems.forEach(function(cloudItem) {
          var existingIndex = combined.findIndex(function(item) { return item.id === cloudItem.id; });
          if (existingIndex >= 0) {
            combined[existingIndex] = Object.assign({}, combined[existingIndex], cloudItem);
          } else {
            combined.push(cloudItem);
          }
        });
        INITIAL_DATA.forEach(function(defaultItem) {
          var alreadyIncluded = combined.some(function(item) { return item.id === defaultItem.id; });
          if (!alreadyIncluded) combined.push(defaultItem);
        });
        services = combined;
        try {
          localStorage.setItem('facilita_ai_services', JSON.stringify(services));
        } catch (storageError) {}
        renderAll();
      }
    }, function(err) {
      console.warn('[Facilita ai] Firestore snapshot:', err);
    });
  } catch (err) {}
}

function listenReviews() {
  if (!window.cloud) return;
  try {
    window.cloud.onReviews(function(snapshot) {
      var mergedById = {};
      reviews.forEach(function(review) { mergedById[review.id] = review; });
      snapshot.forEach(function(doc) {
        var data = doc.data();
        if (data.status === 'rejected') return;
        mergedById[doc.id] = {
          id: doc.id,
          serviceId: data.serviceId,
          reviewerName: data.reviewerName || 'Cliente',
          rating: Number(data.rating),
          comment: data.comment || '',
          createdAt: data.createdAt || new Date().toISOString(),
          status: data.status || 'published'
        };
      });
      reviews = Object.keys(mergedById).map(function(id) { return mergedById[id]; });
      saveReviewsLocally();
      renderAll();
      if (activeReviewServiceId) renderReviewsModal();
    }, function(error) {
      console.warn('[Facilita ai] Não foi possível sincronizar avaliações:', error);
    });
  } catch (error) {}
}

function showTab(tabName) {
  document.querySelectorAll('[id^="view-"]').forEach(function(el) { el.classList.add('hidden'); });
  document.querySelectorAll('[id^="tab-btn-"]').forEach(function(el) { el.classList.remove('active'); });

  var view = document.getElementById('view-' + tabName);
  var btn = document.getElementById('tab-btn-' + tabName);
  if (view) view.classList.remove('hidden');
  if (btn) btn.classList.add('active');
  if (tabName === 'inicio' && serviceMap) {
    setTimeout(function() { serviceMap.invalidateSize(); }, 100);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setRadius(r) {
  currentRadius = r;
  document.querySelectorAll('.radius-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.textContent.includes(r === 999 ? 'Todos' : r + ' km'));
  });
  currentPage = 1;
  updateRadiusCircle();
  renderAll();
}

function filterCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(function(btn) {
    btn.classList.toggle('active', (cat === 'todos' && btn.textContent.includes('Todos')) || (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(cat)));
  });
  currentPage = 1;
  renderAll();
}

function handleSearch() {
  searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
  currentPage = 1;
  renderAll();
}

function getFilteredList() {
  return services.filter(function(s) {
    var distance = getServiceDistance(s);
    if (currentRadius !== 999 && distance > currentRadius) return false;
    if (currentCategory !== 'todos' && s.category !== currentCategory) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery) && !s.desc.toLowerCase().includes(searchQuery)) return false;
    return true;
  });
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  var earthRadius = 6371;
  var toRadians = function(value) { return value * Math.PI / 180; };
  var deltaLat = toRadians(lat2 - lat1);
  var deltaLng = toRadians(lng2 - lng1);
  var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getServiceDistance(service) {
  var latitude = Number(service.latitude);
  var longitude = Number(service.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
    return calculateDistanceKm(userLocation.lat, userLocation.lng, latitude, longitude);
  }
  return Number(service.dist) || 0;
}

function renderAll() {
  var list = getFilteredList();
  updateResultsSummary(list.length);
  renderMapPins(list);
  renderCards(list, 'servicesGrid', 'paginationControls');
  renderCards(services, 'fullServicesGrid', 'fullPaginationControls');
}

function updateResultsSummary(total) {
  var summary = document.getElementById('resultsSummary');
  if (!summary) return;

  var typedQuery = document.getElementById('searchInput').value.trim();
  if (typedQuery) {
    if (total === 0) {
      summary.textContent = 'Nenhum resultado encontrado para “' + typedQuery + '”.';
    } else {
      summary.textContent = total + (total === 1 ? ' resultado encontrado' : ' resultados encontrados') + ' para “' + typedQuery + '”.';
    }
    return;
  }

  summary.textContent = total + (total === 1 ? ' profissional encontrado.' : ' profissionais encontrados.');
}

function renderMapPins(list) {
  if (useFallbackMap) {
    renderFallbackMapPins(list);
    return;
  }
  if (!serviceMap || !serviceMarkers) return;
  serviceMarkers.clearLayers();

  list.forEach(function(service) {
    var latitude = Number(service.latitude);
    var longitude = Number(service.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return;

    var cleanPhone = service.phone ? service.phone.replace(/\D/g, '') : '';
    var whatsapp = service.whatsapp || service.phone || '';
    var cleanWpp = whatsapp.replace(/\D/g, '');
    if (cleanWpp.length === 10 || cleanWpp.length === 11) cleanWpp = '55' + cleanWpp;

    var popup = document.createElement('div');
    var title = document.createElement('div');
    title.className = 'map-popup-title';
    title.textContent = (service.icon || '📍') + ' ' + service.name;

    var meta = document.createElement('div');
    meta.className = 'map-popup-meta';
    meta.textContent = getServiceDistance(service).toFixed(1) + ' km de você • ' + service.neighborhood;

    var actions = document.createElement('div');
    actions.className = 'map-popup-actions';
    var phoneLink = document.createElement('a');
    phoneLink.className = 'btn-tel';
    phoneLink.href = 'tel:' + cleanPhone;
    phoneLink.textContent = '📞 Ligar';
    var whatsappLink = document.createElement('a');
    whatsappLink.className = 'btn-wpp';
    whatsappLink.href = 'https://wa.me/' + cleanWpp + '?text=' + encodeURIComponent('Olá! Encontrei seu contato no Facilita ai.');
    whatsappLink.target = '_blank';
    whatsappLink.rel = 'noopener noreferrer';
    whatsappLink.textContent = '💬 WhatsApp';
    actions.appendChild(phoneLink);
    actions.appendChild(whatsappLink);
    popup.appendChild(title);
    popup.appendChild(meta);
    popup.appendChild(actions);

    L.marker([latitude, longitude]).addTo(serviceMarkers).bindPopup(popup);
  });
}

function renderFallbackMapPins(list) {
  var container = document.getElementById('fallbackPins');
  var popover = document.getElementById('fallbackPopover');
  if (!container) return;
  container.replaceChildren();
  if (popover) popover.classList.add('hidden');

  list.forEach(function(service, index) {
    var angle = (index * 137.5 * Math.PI) / 180;
    var relativeDistance = Math.min(1, getServiceDistance(service) / (currentRadius === 999 ? 30 : currentRadius));
    var spread = 12 + relativeDistance * 27;
    var left = 50 + Math.cos(angle) * spread;
    var top = 50 + Math.sin(angle) * spread;

    var pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'fallback-pin';
    pin.style.left = left + '%';
    pin.style.top = top + '%';
    pin.setAttribute('aria-label', 'Ver ' + service.name);
    var bubble = document.createElement('span');
    bubble.className = 'fallback-pin-bubble';
    bubble.textContent = service.name.split(' ')[0] + ' · ' + getServiceDistance(service).toFixed(1).replace('.', ',') + ' km';
    var icon = document.createElement('span');
    icon.className = 'fallback-pin-icon';
    icon.textContent = service.icon || getCategoryIcon(service.category);
    pin.appendChild(bubble);
    pin.appendChild(icon);
    pin.addEventListener('click', function() { showFallbackPopover(service); });
    container.appendChild(pin);
  });
}

function showFallbackPopover(service) {
  var popover = document.getElementById('fallbackPopover');
  if (!popover) return;
  popover.replaceChildren();

  var closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'fallback-popover-close';
  closeButton.textContent = '✕';
  closeButton.setAttribute('aria-label', 'Fechar');
  closeButton.addEventListener('click', function() { popover.classList.add('hidden'); });
  var title = document.createElement('strong');
  title.textContent = service.name;
  var meta = document.createElement('span');
  meta.textContent = getServiceDistance(service).toFixed(1).replace('.', ',') + ' km de você · ' + (service.neighborhood || service.city || 'Localização não informada');
  var actions = document.createElement('div');
  actions.className = 'fallback-popover-actions';

  var cleanPhone = (service.phone || '').replace(/\D/g, '');
  var cleanWpp = (service.whatsapp || service.phone || '').replace(/\D/g, '');
  if (cleanWpp.length === 10 || cleanWpp.length === 11) cleanWpp = '55' + cleanWpp;
  var phoneLink = document.createElement('a');
  phoneLink.className = 'btn-tel';
  phoneLink.href = 'tel:' + cleanPhone;
  phoneLink.textContent = '📞 Ligar';
  var whatsappLink = document.createElement('a');
  whatsappLink.className = 'btn-wpp';
  whatsappLink.href = 'https://wa.me/' + cleanWpp;
  whatsappLink.target = '_blank';
  whatsappLink.rel = 'noopener noreferrer';
  whatsappLink.textContent = '💬 WhatsApp';
  actions.appendChild(phoneLink);
  actions.appendChild(whatsappLink);

  popover.appendChild(closeButton);
  popover.appendChild(title);
  popover.appendChild(meta);
  popover.appendChild(actions);
  popover.classList.remove('hidden');
}

function renderCards(list, gridId, paginationId) {
  var grid = document.getElementById(gridId);
  var pag = document.getElementById(paginationId);
  if (!grid || !pag) return;
  grid.replaceChildren();

  var totalPages = Math.ceil(list.length / itemsPerPage) || 1;
  var start = (currentPage - 1) * itemsPerPage;
  var pageItems = list.slice(start, start + itemsPerPage);

  if (pageItems.length === 0) {
    var emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = currentRadius === 999
      ? 'Nenhum profissional encontrado. Tente outra busca ou categoria.'
      : 'Nenhum profissional encontrado no raio de ' + currentRadius + ' km. Tente aumentar o raio ou escolher outra categoria.';
    grid.appendChild(emptyState);
    pag.replaceChildren();
    return;
  }

  pageItems.forEach(function(item) {
    var cleanPhone = item.phone ? item.phone.replace(/\D/g, '') : '';
    var cleanWpp = (item.whatsapp || item.phone || '').replace(/\D/g, '');
    if (cleanWpp.length === 11 || cleanWpp.length === 10) cleanWpp = '55' + cleanWpp;
    var distance = getServiceDistance(item).toFixed(1).replace('.', ',');

    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.serviceId = item.id;
    if (item.id === highlightedServiceId) card.classList.add('card-highlight');

    var cardTop = document.createElement('div');
    cardTop.className = 'card-top';
    var icon = document.createElement('div');
    icon.className = 'card-icon';
    icon.textContent = item.icon || getCategoryIcon(item.category);
    var headingBox = document.createElement('div');
    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.name || 'Profissional';
    var status = document.createElement('span');
    status.className = 'card-status';
    status.textContent = 'Entre em contato';
    headingBox.appendChild(title);
    headingBox.appendChild(status);
    cardTop.appendChild(icon);
    cardTop.appendChild(headingBox);

    var meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = '📍 ' + distance + ' km de você • ' + (item.neighborhood || item.city || 'Localização não informada');
    var description = document.createElement('div');
    description.className = 'card-desc';
    description.textContent = item.desc || 'Entre em contato para saber mais sobre os serviços.';

    var reviewData = getReviewSummary(item.id);
    var reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'review-summary';
    reviewButton.setAttribute('aria-label', 'Ver avaliações de ' + (item.name || 'profissional'));
    var reviewStars = document.createElement('span');
    reviewStars.className = 'review-stars';
    reviewStars.textContent = reviewData.count ? formatStars(reviewData.average) : '☆☆☆☆☆';
    var reviewText = document.createElement('span');
    reviewText.textContent = reviewData.count
      ? reviewData.average.toFixed(1).replace('.', ',') + ' · ' + reviewData.count + (reviewData.count === 1 ? ' avaliação' : ' avaliações')
      : 'Avaliar';
    reviewButton.appendChild(reviewStars);
    reviewButton.appendChild(reviewText);
    reviewButton.addEventListener('click', function() { openReviews(item.id); });

    var actions = document.createElement('div');
    actions.className = 'card-btns';
    var phoneLink = document.createElement('a');
    phoneLink.className = 'btn-tel';
    phoneLink.href = 'tel:' + cleanPhone;
    phoneLink.textContent = '📞 Ligar';
    var whatsappLink = document.createElement('a');
    whatsappLink.className = 'btn-wpp';
    whatsappLink.href = 'https://wa.me/' + cleanWpp;
    whatsappLink.target = '_blank';
    whatsappLink.rel = 'noopener noreferrer';
    whatsappLink.textContent = '💬 WhatsApp';
    actions.appendChild(phoneLink);
    actions.appendChild(whatsappLink);

    card.appendChild(cardTop);
    card.appendChild(meta);
    card.appendChild(description);
    card.appendChild(reviewButton);
    card.appendChild(actions);
    grid.appendChild(card);
  });

  // Pagination Controls
  pag.replaceChildren();
  if (totalPages > 1) {
    var prevBtn = document.createElement('button');
    prevBtn.className = 'page-nav-btn';
    prevBtn.textContent = '« Anterior';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = function() { currentPage--; renderAll(); };
    pag.appendChild(prevBtn);

    for (var p = 1; p <= totalPages; p++) {
      (function(pageNum) {
        var btn = document.createElement('button');
        btn.className = 'page-btn ' + (pageNum === currentPage ? 'active' : '');
        btn.textContent = pageNum;
        btn.onclick = function() { currentPage = pageNum; renderAll(); };
        pag.appendChild(btn);
      })(p);
    }

    var nextBtn = document.createElement('button');
    nextBtn.className = 'page-nav-btn';
    nextBtn.textContent = 'Próximo »';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = function() { currentPage++; renderAll(); };
    pag.appendChild(nextBtn);
  }
}

function getReviewsForService(serviceId) {
  return reviews.filter(function(review) {
    return review.serviceId === serviceId && review.status !== 'rejected' &&
      Number(review.rating) >= 1 && Number(review.rating) <= 5;
  }).sort(function(a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function getReviewSummary(serviceId) {
  var serviceReviews = getReviewsForService(serviceId);
  if (serviceReviews.length === 0) return { count: 0, average: 0 };
  var total = serviceReviews.reduce(function(sum, review) {
    return sum + Number(review.rating);
  }, 0);
  return { count: serviceReviews.length, average: total / serviceReviews.length };
}

function formatStars(rating) {
  var filled = Math.max(0, Math.min(5, Math.round(rating)));
  return '★★★★★'.slice(0, filled) + '☆☆☆☆☆'.slice(0, 5 - filled);
}

function formatReviewDate(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function getServiceById(serviceId) {
  return services.find(function(service) { return service.id === serviceId; });
}

function openReviews(serviceId) {
  activeReviewServiceId = serviceId;
  var form = document.getElementById('reviewForm');
  if (form) form.reset();
  renderReviewsModal();
  var modal = document.getElementById('reviewsModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('reviewsCloseButton').focus();
}

function closeReviews() {
  var modal = document.getElementById('reviewsModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  activeReviewServiceId = null;
}

function handleReviewsBackdrop(event) {
  if (event.target && event.target.id === 'reviewsModal') closeReviews();
}

function renderReviewsModal() {
  if (!activeReviewServiceId) return;
  var service = getServiceById(activeReviewServiceId);
  var serviceReviews = getReviewsForService(activeReviewServiceId);
  var summary = getReviewSummary(activeReviewServiceId);
  var title = document.getElementById('reviewsModalTitle');
  var summaryText = document.getElementById('reviewsModalSummary');
  var list = document.getElementById('reviewsList');
  var form = document.getElementById('reviewForm');
  var alreadyMessage = document.getElementById('reviewAlreadyMessage');

  title.textContent = 'Avaliações de ' + (service ? service.name : 'profissional');
  summaryText.textContent = summary.count
    ? formatStars(summary.average) + ' ' + summary.average.toFixed(1).replace('.', ',') + ' de 5 · ' + summary.count + (summary.count === 1 ? ' avaliação' : ' avaliações')
    : 'Ainda não há avaliações. Seja a primeira pessoa a avaliar.';

  list.replaceChildren();
  if (serviceReviews.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'reviews-empty';
    empty.textContent = 'Nenhum feedback publicado para este profissional.';
    list.appendChild(empty);
  } else {
    serviceReviews.forEach(function(review) {
      var item = document.createElement('article');
      item.className = 'review-item';
      var header = document.createElement('div');
      header.className = 'review-item-header';
      var author = document.createElement('span');
      author.className = 'review-author';
      author.textContent = review.reviewerName || 'Cliente';
      var date = document.createElement('time');
      date.className = 'review-date';
      date.dateTime = review.createdAt || '';
      date.textContent = formatReviewDate(review.createdAt);
      header.appendChild(author);
      header.appendChild(date);
      var stars = document.createElement('div');
      stars.className = 'review-item-stars';
      stars.textContent = formatStars(Number(review.rating));
      stars.setAttribute('aria-label', review.rating + ' de 5 estrelas');
      var comment = document.createElement('p');
      comment.className = 'review-text';
      comment.textContent = review.comment;
      item.appendChild(header);
      item.appendChild(stars);
      item.appendChild(comment);
      list.appendChild(item);
    });
  }

  var alreadyReviewed = Boolean(reviewedServiceIds[activeReviewServiceId]);
  form.classList.toggle('hidden', alreadyReviewed);
  alreadyMessage.classList.toggle('hidden', !alreadyReviewed);
}

function handleReviewSubmit(event) {
  event.preventDefault();
  var serviceId = activeReviewServiceId;
  if (!serviceId || reviewedServiceIds[serviceId]) {
    showToast('Você já avaliou este profissional neste navegador.');
    return;
  }

  var name = document.getElementById('reviewName').value.trim();
  var selectedRating = document.querySelector('input[name="review-rating"]:checked');
  var rating = selectedRating ? Number(selectedRating.value) : 0;
  var comment = document.getElementById('reviewComment').value.trim();
  if (name.length < 2 || rating < 1 || rating > 5 || comment.length < 10) {
    showToast('Preencha seu nome, a nota e um comentário com pelo menos 10 caracteres.');
    return;
  }

  var review = {
    id: 'review-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    serviceId: serviceId,
    reviewerName: name,
    rating: rating,
    comment: comment,
    createdAt: new Date().toISOString(),
    status: 'published'
  };

  reviews.unshift(review);
  reviewedServiceIds[serviceId] = review.id;
  saveReviewsLocally();
  renderAll();
  renderReviewsModal();
  showToast('⭐ Avaliação publicada. Obrigado pelo feedback!');

  if (window.cloud) {
    try {
      window.cloud.setReview(review.id, review).catch(function(error) {
        console.warn('[Facilita ai] Avaliação salva apenas neste navegador:', error);
      });
    } catch (error) {}
  }
}

function resetDiscoveryFilters() {
  currentRadius = 999;
  currentCategory = 'todos';
  searchQuery = '';
  currentPage = 1;

  var searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('.radius-btn').forEach(function(button) {
    button.classList.toggle('active', button.textContent.includes('Todos'));
  });
  document.querySelectorAll('.cat-pill').forEach(function(button) {
    button.classList.toggle('active', button.textContent.includes('Todos os Serviços'));
  });
  updateRadiusCircle();
}

function normalizeText(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isValidBrazilianPhone(value) {
  var digits = value.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

// Formulário de cadastro de serviços
function handleRegisterSubmit(e, formType) {
  e.preventDefault();
  var prefix = formType === 'page' ? 'page-reg-' : 'reg-';
  var name = document.getElementById(prefix + 'name').value.trim();
  var category = document.getElementById(prefix + 'category').value;
  var phone = document.getElementById(prefix + 'phone').value.trim();
  var wpp = document.getElementById(prefix + 'wpp').value.trim() || phone;
  var city = document.getElementById(prefix + 'city').value.trim();
  var state = document.getElementById(prefix + 'state').value.trim().toUpperCase();
  var cep = document.getElementById(prefix + 'cep').value.trim();
  var street = document.getElementById(prefix + 'street').value.trim();
  var number = document.getElementById(prefix + 'number').value.trim();
  var complement = document.getElementById(prefix + 'complement').value.trim();
  var neighborhood = document.getElementById(prefix + 'neighborhood').value.trim();
  var latitude = Number(document.getElementById(prefix + 'latitude').value) || null;
  var longitude = Number(document.getElementById(prefix + 'longitude').value) || null;
  var desc = document.getElementById(prefix + 'desc').value.trim() || 'Profissional verificado no Facilita ai.';
  var consentGivenAt = new Date().toISOString();

  if (!isValidBrazilianPhone(phone)) {
    showToast('Informe um telefone válido com DDD.');
    document.getElementById(prefix + 'phone').focus();
    return;
  }
  if (wpp && !isValidBrazilianPhone(wpp)) {
    showToast('Informe um WhatsApp válido com DDD.');
    document.getElementById(prefix + 'wpp').focus();
    return;
  }

  var phoneDigits = phone.replace(/\D/g, '');
  var duplicate = services.some(function(service) {
    return normalizeText(service.name || '') === normalizeText(name) &&
      (service.phone || '').replace(/\D/g, '') === phoneDigits;
  });
  if (duplicate) {
    showToast('Este serviço já está cadastrado com o mesmo telefone.');
    return;
  }

  var newService = {
    id: 'serv-' + Date.now(),
    name: name,
    category: category,
    icon: getCategoryIcon(category),
    dist: 0.8,
    neighborhood: neighborhood,
    city: city,
    state: state,
    cep: cep,
    street: street,
    number: number,
    complement: complement,
    latitude: latitude,
    longitude: longitude,
    phone: phone,
    whatsapp: wpp,
    desc: desc,
    status: 'Disponível para contato',
    consentGivenAt: consentGivenAt
  };

  if (!window.cloud) {
    showToast('Sem conexão com a nuvem. Recarregue a página e tente novamente.');
    return;
  }

  var form = e.target;
  var submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  // Só confirma o cadastro depois que o Firestore realmente gravar
  window.cloud.setService(newService.id, {
    name: name,
    category: category,
    phone: phone,
    whatsapp: wpp,
    city: city,
    state: state,
    cep: cep,
    street: street,
    number: number,
    complement: complement,
    neighborhood: neighborhood,
    latitude: latitude,
    longitude: longitude,
    description: desc,
    consentGivenAt: consentGivenAt,
    distanceKm: 0.8,
    distance: '0,8 km',
    status: 'Disponível para contato',
    createdAt: new Date().toISOString()
  }).then(function() {
    console.log('[Facilita ai] Publicado no Firestore com sucesso.');

    // Cache local (a fonte de verdade é a nuvem)
    services.unshift(newService);
    try {
      localStorage.setItem('facilita_ai_services', JSON.stringify(services));
    } catch (err) {}

    highlightedServiceId = newService.id;
    resetDiscoveryFilters();
    showToast('🎉 Cadastro de ' + name + ' realizado com sucesso!');
    form.reset();
    setCepStatus(prefix, 'Digite o CEP para preencher o endereço.', '');
    showTab('inicio');
    renderAll();
    setTimeout(function() {
      var newCard = document.querySelector('#servicesGrid [data-service-id="' + newService.id + '"]');
      if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }).catch(function(err) {
    console.error('[Facilita ai] Erro Firestore:', err);
    showToast('Não foi possível salvar na nuvem (' + (err && err.code ? err.code : 'erro') + '). Tente novamente.');
  }).then(function() {
    if (submitBtn) submitBtn.disabled = false;
  });
}

