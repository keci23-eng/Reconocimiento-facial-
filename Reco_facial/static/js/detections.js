// static/js/detections.js
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('detectionsBody');

  // Filtros UI
  const filterInput = document.getElementById('filterInput');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  const filterBtn = document.getElementById('filterBtn');
  const clearBtn = document.getElementById('clearBtn');

  // Paginación UI
  const pagePrev = document.getElementById('pagePrev');
  const pageNext = document.getElementById('pageNext');
  const pageInfo = document.getElementById('pageInfo');

  // Estado paginación
  let pager = { page: 1, page_size: 10, total_pages: 1, count: 0 };

  function setLoading() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando detecciones…</td></tr>`;
  }

  function setError(msg) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger">${msg || 'Error al cargar detecciones'}</td></tr>`;
  }

  function updatePaginationUI() {
    try {
      if (pageInfo) pageInfo.textContent = `Página ${pager.page} de ${pager.total_pages} · Total: ${pager.count}`;
      if (pagePrev) pagePrev.disabled = pager.page <= 1;
      if (pageNext) pageNext.disabled = pager.page >= pager.total_pages;
    } catch (_) {}
  }

  function gatherFilters() {
    return {
      q: filterInput?.value?.trim() || '',
      start: startDate?.value || '',
      end: endDate?.value || '',
      page: pager.page,
      page_size: pager.page_size,
    };
  }

  async function loadDetections(opts) {
    opts = opts || {};
    if (!tbody) return;

    try {
      const params = new URLSearchParams();

      const q = (opts.q ?? '').trim();
      const start = opts.start ?? '';
      const end = opts.end ?? '';

      const page = Number.isFinite(+opts.page) && +opts.page > 0 ? +opts.page : (pager.page || 1);
      const page_size = Number.isFinite(+opts.page_size) && +opts.page_size > 0 ? +opts.page_size : (pager.page_size || 10);

      if (q) params.set('q', q);
      if (start) params.set('start', start);
      if (end) params.set('end', end);

      params.set('page', String(page));
      params.set('page_size', String(page_size));

      const url = `/api/detections/?${params.toString()}`;

      console.debug('fetching', url);
      const res = await fetch(url, { credentials: 'same-origin' });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        console.error('Respuesta no JSON', e);
        setError('Respuesta inválida del servidor');
        return;
      }

      console.debug('detections API response:', data);

      // ✅ Normalizar respuesta: paginada o lista
      if (data && data.results && Array.isArray(data.results)) {
        pager.count = data.count ?? 0;
        pager.page = data.page ?? page;
        pager.page_size = data.page_size ?? page_size;
        pager.total_pages = data.total_pages ?? Math.max(1, Math.ceil((pager.count || 0) / (pager.page_size || 10)));
        data = data.results;
      } else if (data && Array.isArray(data.detections)) {
        // por si en algún punto el backend devuelve {detections:[...]}
        data = data.detections;
        // sin meta real de paginación
        pager.count = data.length;
        pager.total_pages = 1;
        pager.page = 1;
      } else if (Array.isArray(data)) {
        // lista simple
        pager.count = data.length;
        pager.total_pages = 1;
        pager.page = 1;
      } else {
        console.warn('Formato inesperado:', data);
        setError('Formato inválido de respuesta');
        return;
      }

      // Render tabla
      tbody.innerHTML = '';
      const seen = new Set(); // ✅ FIX: evita "seen is not defined"

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No hay detecciones registradas.</td></tr>`;
        updatePaginationUI();
        return;
      }

      data.forEach(det => {
        const key = det?.id
          ? `id:${det.id}`
          : `k:${(det?.recognized_name || det?.student || '')}:${det?.timestamp || ''}:${det?.confidence || ''}`;

        if (seen.has(key)) return;
        seen.add(key);

        const tr = document.createElement('tr');

        const imgTd = document.createElement('td');
        const nameTd = document.createElement('td');
        const careerTd = document.createElement('td');
        const timeTd = document.createElement('td');
        const confTd = document.createElement('td');

        if (det?.image) {
          imgTd.innerHTML = `<img src="${det.image}" class="thumb" alt="deteccion">`;
        } else {
          imgTd.textContent = '—';
        }

        nameTd.textContent = det?.recognized_name || det?.student || 'Desconocido';
        careerTd.textContent = det?.recognized_career || '';
        timeTd.textContent = det?.timestamp ? new Date(det.timestamp).toLocaleString() : '';

        // Mostrar confianza como porcentaje invertido:
        // Se asume que `confidence` es una distancia en [0,1] donde menor = más parecido.
        // Porcentaje = (1 - confidence) * 100, clamp 0..100
        function confidenceToPercent(c) {
          if (c == null) return '';
          const n = Number(c);
          if (!Number.isFinite(n)) return '';
          let pct = (1 - n) * 100;
          if (pct < 0) pct = 0;
          if (pct > 100) pct = 100;
          return `${Math.round(pct)}%`;
        }

        confTd.textContent = confidenceToPercent(det?.confidence);

        tr.appendChild(imgTd);
        tr.appendChild(nameTd);
        tr.appendChild(careerTd);
        tr.appendChild(timeTd);
        tr.appendChild(confTd);

        tbody.appendChild(tr);
      });

      updatePaginationUI();

    } catch (e) {
      console.error('Error loading detections', e);
      setError('Error al cargar detecciones');
    }
  }

  // Eventos filtros
  filterBtn?.addEventListener('click', () => {
    pager.page = 1;
    loadDetections(gatherFilters());
  });

  clearBtn?.addEventListener('click', () => {
    if (filterInput) filterInput.value = '';

    // Si usas flatpickr
    if (startDate?._flatpickr) startDate._flatpickr.clear();
    else if (startDate) startDate.value = '';

    if (endDate?._flatpickr) endDate._flatpickr.clear();
    else if (endDate) endDate.value = '';

    pager.page = 1;
    loadDetections(gatherFilters());
  });

  // Paginación
  pagePrev?.addEventListener('click', () => {
    if (pager.page > 1) {
      pager.page -= 1;
      loadDetections(gatherFilters());
    }
  });

  pageNext?.addEventListener('click', () => {
    if (pager.page < pager.total_pages) {
      pager.page += 1;
      loadDetections(gatherFilters());
    }
  });

  // Inicial + polling
  setLoading();
  loadDetections(gatherFilters());
  setInterval(() => {
    loadDetections(gatherFilters());
  }, 10000);
});
