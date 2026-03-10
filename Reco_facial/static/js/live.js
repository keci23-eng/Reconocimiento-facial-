document.addEventListener('DOMContentLoaded', ()=>{

  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const ctx = overlay.getContext('2d');
  const studentsList = document.getElementById('studentsList');

  async function startCamera(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({video:{width:640, height:480}, audio:false});
      video.srcObject = stream;
      try{ video.style.setProperty('transform', 'none', 'important'); }catch(e){}
      await video.play();
    }catch(err){
      alert('No se puede acceder a la cámara. Revise permisos. ' + err.message);
    }
  }

  function captureFrame(){
    const c = document.createElement('canvas');
    const w = video.clientWidth || video.videoWidth || 640;
    const h = video.clientHeight || video.videoHeight || 480;
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d');
    cctx.drawImage(video, 0, 0, c.width, c.height);
    return c;
  }

  // capture a scaled frame (useful for fast, low-res first detection)
  function captureFrameScaled(targetW, targetH){
    const c = document.createElement('canvas');
    c.width = targetW;
    c.height = targetH;
    const cctx = c.getContext('2d');
    // draw the video scaled down to the target size
    try{
      cctx.drawImage(video, 0, 0, targetW, targetH);
    }catch(e){
      // fallback to normal capture if drawImage fails
      const fallback = captureFrame();
      return fallback;
    }
    return c;
  }

  let lastRequest = 0;
  // send detection to server every 8000 ms (8 seconds)
  const INTERVAL_MS = 2500; // frecuencia base de detección al servidor

  // Tracking state (client-side template matching between server hits)
  let tracking = null;
  // tracking = { template: HTMLCanvasElement, box: {left,top,right,bottom}, lastSeen: timestamp }
  const TRACK_SEARCH_RADIUS = 60; // px
  const TRACK_MAX_AGE = 2000; // ms sin actualizar tras lo cual se considera perdido
  const TRACK_MATCH_THRESHOLD = 0.25; // SAD normalized threshold (lower is better)
   

  async function sendDetectionOnce(small=false){
    const now = Date.now();
    if(now - lastRequest < INTERVAL_MS) return;
    lastRequest = now;
    const c = small ? captureFrameScaled(320,240) : captureFrame();
    c.toBlob(async (blob)=>{
        try{
          const fd = new FormData();
          fd.append('image', blob, 'frame.jpg');
          fd.append('client_timestamp', new Date().toISOString());
          const csrftoken = getCookie('csrftoken');
          const res = await fetch('/api/detect/', {method:'POST', body:fd, credentials: 'same-origin', headers: {'X-CSRFToken': csrftoken}});
          const data = await res.json();
          drawResults(data);
          // if server returned detections, choose which detection to use for
          // initializing/updating tracking. Prefer a recognized student (green)
          // so tracking follows the correct identity. Fall back to first box.
          if(data && data.detections && data.detections.length){
            let chosen = null;
            // prefer recognized detections
            for(const d of data.detections){
              if(d && d.box && d.name){ chosen = d; break; }
            }
            if(!chosen) chosen = data.detections[0];
            if(chosen && chosen.box){ initTrackingFromBox(chosen); }
          }
        }catch(e){
          console.error('Detection error', e);
        }
    }, 'image/jpeg', 0.7);
  }

  function initTrackingFromBox(detection){
    const box = detection.box;
    // grab the template from current video frame corresponding to box
    const w = video.clientWidth || video.videoWidth || 640;
    const h = video.clientHeight || video.videoHeight || 480;
    const c = document.createElement('canvas');
    const cw = Math.max(32, Math.min(160, Math.round((box.right - box.left))));
    const ch = Math.max(32, Math.min(160, Math.round((box.bottom - box.top))));
    c.width = cw;
    c.height = ch;
    const cc = c.getContext('2d');
    // compute draw coords relative to video pixels
    const sx = box.left;
    const sy = box.top;
    try{
      cc.drawImage(video, sx, sy, box.right - box.left, box.bottom - box.top, 0, 0, cw, ch);
      tracking = {
        template: c,
        box: {left: box.left, top: box.top, right: box.right, bottom: box.bottom},
        lastSeen: Date.now(),
        recognized: !!detection.name,
        name: detection.name || null,
        career: detection.career || null,
      };
    }catch(e){
      // fallback: disable tracking
      tracking = null;
    }
  }

  // run a lightweight template match (SAD) in a small window around previous box
  function matchTemplate(templateCanvas, searchCanvas){
    const tctx = templateCanvas.getContext('2d');
    const sctx = searchCanvas.getContext('2d');
    const tw = templateCanvas.width;
    const th = templateCanvas.height;
    const sw = searchCanvas.width;
    const sh = searchCanvas.height;
    const tdata = tctx.getImageData(0,0,tw,th).data;
    const sdata = sctx.getImageData(0,0,sw,sh).data;

    let best = {x:0,y:0,score:Infinity};
    // iterate possible positions where template fits
    for(let y=0;y<=sh-th;y+=4){
      for(let x=0;x<=sw-tw;x+=4){
        let sad = 0;
        // compute SAD on luminance for speed
        for(let ty=0; ty<th; ty+=4){
          for(let tx=0; tx<tw; tx+=4){
            const tIdx = ((ty*tw)+tx)*4;
            const sIdx = (((y+ty)*sw)+(x+tx))*4;
            const tl = 0.299*tdata[tIdx] + 0.587*tdata[tIdx+1] + 0.114*tdata[tIdx+2];
            const sl = 0.299*sdata[sIdx] + 0.587*sdata[sIdx+1] + 0.114*sdata[sIdx+2];
            sad += Math.abs(tl - sl);
          }
        }
        const norm = sad / ((tw/4)*(th/4));
        if(norm < best.score){ best = {x, y, score: norm}; }
      }
    }
    return best;
  }

  function updateTracking(){
    if(!tracking) return;
    const now = Date.now();
    if(now - tracking.lastSeen > TRACK_MAX_AGE){ tracking = null; return; }

    // capture a search canvas around previous box
    const left = Math.max(0, Math.round(tracking.box.left - TRACK_SEARCH_RADIUS));
    const top = Math.max(0, Math.round(tracking.box.top - TRACK_SEARCH_RADIUS));
    const right = Math.round(tracking.box.right + TRACK_SEARCH_RADIUS);
    const bottom = Math.round(tracking.box.bottom + TRACK_SEARCH_RADIUS);
    const sw = Math.max(32, right - left);
    const sh = Math.max(32, bottom - top);
    const sc = document.createElement('canvas');
    sc.width = sw;
    sc.height = sh;
    const sctx = sc.getContext('2d');
    try{
      sctx.drawImage(video, left, top, sw, sh, 0, 0, sw, sh);
    }catch(e){ tracking = null; return; }

    const best = matchTemplate(tracking.template, sc);
    if(best.score <= TRACK_MATCH_THRESHOLD * 255){
      // update box coordinates (best.x,best.y) relative to search canvas
      const nx = left + best.x;
      const ny = top + best.y;
      tracking.box = { left: nx, top: ny, right: nx + tracking.template.width, bottom: ny + tracking.template.height };
      tracking.lastSeen = Date.now();
    } else {
      // low confidence -> allow it to age out and wait for next server detection
    }
  }

  function drawResults(data){
    ctx.clearRect(0,0,overlay.width, overlay.height);
    if(!data || !data.detections) return;

    const dispW = overlay.clientWidth || overlay.width;
    const dispH = overlay.clientHeight || overlay.height;
    const intW = overlay.width || dispW;
    const intH = overlay.height || dispH;
    const scaleX = dispW / intW || 1;
    const scaleY = dispH / intH || 1;

    let mirror = false;
    try{
      const t = window.getComputedStyle(video).transform || '';
      if(t){
        if(t.indexOf('matrix(') === 0){
          const nums = t.replace(/matrix\(|\)/g, '').split(',').map(s=>parseFloat(s.trim()));
          if(nums.length >= 1 && nums[0] < 0) mirror = true;
        } else if(t.indexOf('scaleX(') !== -1){
          if(t.indexOf('scaleX(-1)') !== -1 || t.indexOf('scale(-1') !== -1) mirror = true;
        }
      }
      if(video.style && video.style.transform && video.style.transform.includes('scaleX(-1)')) mirror = true;
    }catch(e){ }

    data.detections.forEach(d => {
      const box = d.box;
      if(!box) return;
      const top = box.top;
      const left = box.left;
      const right = box.right;
      const bottom = box.bottom;
      const w = right - left;
      const h = bottom - top;

      const drawW = Math.max(1, w * scaleX);
      const drawH = Math.max(1, h * scaleY);
      let drawX = left * scaleX;
      const drawY = top * scaleY;
      if(mirror){ drawX = dispW - ((left + w) * scaleX); }

      ctx.strokeStyle = d.name ? 'lime' : 'yellow';
      ctx.lineWidth = Math.max(2, 3 * ((scaleX + scaleY) / 2));
      ctx.strokeRect(drawX, drawY, drawW, drawH);
      const label = d.name ? `${d.name} — ${d.career}` : 'No reconocido';
      ctx.fillStyle = d.name ? 'lime' : 'yellow';
      ctx.font = `${Math.max(12, 12 * ((scaleX + scaleY) / 2))}px sans-serif`;
      const textX = drawX + 4;
      const textY = Math.max(drawY - 6, 14);
      ctx.fillText(label, textX, textY);
    });

    // if tracking active, only draw the tracking box when the server did NOT
    // return a detection that overlaps it. This avoids leaving the old
    // tracking box visible when the server already drew the recognized box.
    if(tracking){
      // check overlap with server detections
      let overlapped = false;
      if(data && data.detections){
        for(const d of data.detections){
          if(!d || !d.box) continue;
          const a = tracking.box;
          const b = d.box;
          const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if(ix > 0 && iy > 0){
            const inter = ix * iy;
            const areaA = (a.right - a.left) * (a.bottom - a.top);
            const areaB = (b.right - b.left) * (b.bottom - b.top);
            const denom = Math.min(areaA, areaB) || 1;
            if((inter / denom) >= 0.25){ overlapped = true; break; }
          }
        }
      }

      if(!overlapped){
        const box = tracking.box;
        const w = box.right - box.left;
        const h = box.bottom - box.top;
        const dispW = overlay.clientWidth || overlay.width;
        const dispH = overlay.clientHeight || overlay.height;
        const intW = overlay.width || dispW;
        const intH = overlay.height || dispH;
        const scaleX = dispW / intW || 1;
        const scaleY = dispH / intH || 1;
        let drawX = box.left * scaleX;
        const drawY = box.top * scaleY;
        if(video.style && video.style.transform && video.style.transform.includes('scaleX(-1)')){
          drawX = dispW - ((box.left + w) * scaleX);
        }
        ctx.strokeStyle = tracking.recognized ? 'lime' : 'yellow';
        ctx.lineWidth = Math.max(2, 3 * ((scaleX + scaleY) / 2));
        ctx.strokeRect(drawX, drawY, Math.max(1,w*scaleX), Math.max(1,h*scaleY));
        ctx.fillStyle = tracking.recognized ? 'lime' : 'yellow';
        ctx.font = `${Math.max(12, 12 * ((scaleX + scaleY) / 2))}px sans-serif`;
        const label = tracking.recognized ? `${tracking.name} — ${tracking.career}` : 'No reconocido';
        ctx.fillText(label, drawX + 4, Math.max(drawY - 6, 14));
      }
    }
  }

  // drive tracking updates at animation frame rate
  function trackingLoop(){
    updateTracking();
    requestAnimationFrame(trackingLoop);
  }
  trackingLoop();

  async function loadStudents(){
    try{
      const res = await fetch('/api/students/');
      const data = await res.json();

      studentsList.innerHTML = '';

      if(!data || data.length === 0){
        studentsList.innerHTML = '<li class="list-group-item text-muted">Sin estudiantes registrados</li>';
      } else {
        data.forEach(s=>{
          const li = document.createElement('li');
          li.className = 'list-group-item';
          let imgHtml = '';
          if(s.image){
            imgHtml = `<img src="${s.image}" alt="${s.name}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid rgba(0,0,0,.06);">`;
          }
          li.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px">
              ${imgHtml}
              <div>
                <strong>${s.name}</strong><br>
                <small>${s.career}</small>
              </div>
            </div>
          `;
          studentsList.appendChild(li);
        });
        const sc = document.getElementById('studentsCount');
        if(sc) sc.textContent = String(data.length || 0);
      }

    }catch(e){
      console.error('Load students error:', e);
      studentsList.innerHTML = '<li class="list-group-item text-danger">Error al cargar estudiantes</li>';
    }
  }

  startCamera().then(()=>{
    video.addEventListener('loadedmetadata', ()=>{
      const w = video.clientWidth || video.videoWidth || 640;
      const h = video.clientHeight || video.videoHeight || 480;
      overlay.width = w;
      overlay.height = h;
      overlay.style.width = w + 'px';
      overlay.style.height = h + 'px';
      // do an immediate low-res detection as soon as metadata is available so the box appears fast
      try{ sendDetectionOnce(true); }catch(e){ console.debug('initial detection error', e); }
      // also trigger a quick low-res detection when the video starts playing
      video.addEventListener('playing', ()=>{ try{ sendDetectionOnce(true); }catch(e){} }, { once: true });
    });
    setInterval(sendDetectionOnce, INTERVAL_MS);
  });

  function updateOverlaySize(){
    try{
      const w = video.clientWidth || video.videoWidth || 640;
      const h = video.clientHeight || video.videoHeight || 480;
      overlay.width = w;
      overlay.height = h;
      overlay.style.width = w + 'px';
      overlay.style.height = h + 'px';
    }catch(e){console.error('updateOverlaySize error', e);}
  }

  window.addEventListener('resize', updateOverlaySize);
  if(window.ResizeObserver){
    try{
      const ro = new ResizeObserver(()=>{ updateOverlaySize(); });
      ro.observe(video);
      ro.observe(overlay);
    }catch(e){/* ignore */}
  }

  loadStudents();
  setInterval(loadStudents, 5000);

});

// Read a cookie value by name (used to fetch CSRF token)
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}
