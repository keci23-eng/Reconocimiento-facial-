document.addEventListener('DOMContentLoaded', ()=>{
  const tbody = document.getElementById('detectionsBody');
  let lastIds = new Set();

  async function loadDetections(){
    try{
      const res = await fetch('/api/detections/?limit=50');
      const data = await res.json();
      if(!Array.isArray(data)) return;

      // normalize response shape (some endpoints return {detections: [...]})
      if(!Array.isArray(data)){
        if(Array.isArray(data.detections)) data = data.detections;
        else return;
      }

      // clear existing rows before re-rendering to avoid duplicates
      tbody.innerHTML = '';

      // Build rows (skip duplicates within the response)
      const seen = new Set();
      data.forEach(det => {
        // compute a stable key: prefer `id`, otherwise fallback to combined fields
        const key = det.id ? `id:${det.id}` : `k:${(det.recognized_name||det.student||'')}:${det.timestamp||''}:${det.confidence||''}`;
        if(seen.has(key)) return; // skip duplicate
        seen.add(key);
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

  // Poll every 5 seconds
  loadDetections();
  setInterval(loadDetections, 5000);
});