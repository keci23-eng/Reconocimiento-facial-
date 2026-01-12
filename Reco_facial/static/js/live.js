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
  const INTERVAL_MS = 8000;

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
        const res = await fetch('/api/detect/', {method:'POST', body:fd});
        const data = await res.json();
        drawResults(data);
      }catch(e){
        console.error('Detection error', e);
      }
    }, 'image/jpeg', 0.7);
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
  }

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
