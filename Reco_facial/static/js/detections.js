document.addEventListener('DOMContentLoaded', ()=>{
  const tbody = document.getElementById('detectionsBody');
  let lastIds = new Set();
  async function loadDetections(opts){
    opts = opts || {};
    try{
      const params = new URLSearchParams();
      if(opts.q) params.set('q', opts.q);
      if(opts.start) params.set('start', opts.start);
      if(opts.end) params.set('end', opts.end);
      params.set('limit', opts.limit || 200);

      const res = await fetch('/api/detections/?' + params.toString());
      let data = await res.json();
      if(!Array.isArray(data)){
        if(Array.isArray(data.detections)) data = data.detections;
        else return;
      }

      tbody.innerHTML = '';
      const seen = new Set();
      data.forEach(det => {
        const key = det.id ? `id:${det.id}` : `k:${(det.recognized_name||det.student||'')}:${det.timestamp||''}:${det.confidence||''}`;
        if(seen.has(key)) return; seen.add(key);

        const tr = document.createElement('tr');
        const imgTd = document.createElement('td');
        const nameTd = document.createElement('td');
        const careerTd = document.createElement('td');
        const timeTd = document.createElement('td');
        const confTd = document.createElement('td');

        if(det.image){
          imgTd.innerHTML = `<img src="${det.image}" class="thumb" alt="deteccion">`;
        }else{
          imgTd.textContent = '—';
        }
        nameTd.textContent = det.recognized_name || (det.student || 'Desconocido');
        careerTd.textContent = det.recognized_career || '';
        timeTd.textContent = det.timestamp ? new Date(det.timestamp).toLocaleString() : '';
        confTd.textContent = det.confidence != null ? (Number(det.confidence).toFixed(3)) : '';

        tr.appendChild(imgTd);
        tr.appendChild(nameTd);
        tr.appendChild(careerTd);
        tr.appendChild(timeTd);
        tr.appendChild(confTd);

        tbody.appendChild(tr);
      });

    }catch(e){
      console.error('Error loading detections', e);
      tbody.innerHTML = '<tr><td colspan="5" class="text-danger">Error al cargar detecciones</td></tr>';
    }
  }

  // wire filters
  const filterInput = document.getElementById('filterInput');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  const filterBtn = document.getElementById('filterBtn');
  const clearBtn = document.getElementById('clearBtn');

  function gatherFilters(){
    return {
      q: filterInput?.value?.trim() || '',
      start: startDate?.value || '',
      end: endDate?.value || '',
      limit: 200
    };
  }

  filterBtn?.addEventListener('click', ()=>{ loadDetections(gatherFilters()); });
  clearBtn?.addEventListener('click', ()=>{ if(filterInput) filterInput.value=''; if(startDate) startDate.value=''; if(endDate) endDate.value=''; loadDetections(); });

  // initial load and polling every 10s
  loadDetections();
  setInterval(()=>{ loadDetections(gatherFilters()); }, 10000);
});