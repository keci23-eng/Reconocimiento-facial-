const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const detectBtn = document.getElementById('detectBtn');
const captureRegisterBtn = document.getElementById('captureRegisterBtn');
const registerForm = document.getElementById('registerForm');
const nameInput = document.getElementById('nameInput');
const careerInput = document.getElementById('careerInput');
const studentsList = document.getElementById('studentsList');

async function startCamera(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
    video.srcObject = stream;
    try{ video.style.transform = 'none'; }catch(e){}
      try{ video.style.setProperty('transform', 'none', 'important'); }catch(e){}
    await video.play();
  }catch(err){
    alert('No se puede acceder a la cámara. Revise permisos. ' + err.message);
  }
}

function captureFrame(){
  const c = document.createElement('canvas');
  // use displayed size so detection coordinates match overlay drawing
  const w = video.clientWidth || video.videoWidth || 640;
  const h = video.clientHeight || video.videoHeight || 480;
  c.width = w;
  c.height = h;
  const cctx = c.getContext('2d');
  cctx.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

async function sendDetection(){
  const c = captureFrame();
  c.toBlob(async (blob)=>{
    const fd = new FormData();
    fd.append('image', blob, 'frame.jpg');
    fd.append('client_timestamp', new Date().toISOString());
    const res = await fetch('/api/detect/', {method:'POST', body:fd});
    const data = await res.json();
    drawResults(data);
  }, 'image/jpeg');
}

function drawResults(data){
  ctx.clearRect(0,0,overlay.width, overlay.height);
  if(!data.detections) return;
  const dispW = overlay.clientWidth || overlay.width;
  const dispH = overlay.clientHeight || overlay.height;
  const intW = overlay.width || dispW;
  const intH = overlay.height || dispH;
  const scaleX = dispW / intW || 1;
  const scaleY = dispH / intH || 1;

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
    const drawX = left * scaleX;
    const drawY = top * scaleY;
    ctx.strokeStyle = d.name ? 'lime' : 'yellow';
    ctx.lineWidth = Math.max(2, 3 * ((scaleX + scaleY) / 2));
    ctx.strokeRect(drawX, drawY, drawW, drawH);
    const label = d.name ? `${d.name} — ${d.career}` : 'No reconocido';
    ctx.fillStyle = d.name ? 'lime' : 'yellow';
    ctx.font = `${Math.max(12, 12 * ((scaleX + scaleY) / 2))}px sans-serif`;
    ctx.fillText(label, drawX + 4, Math.max(drawY - 6, 14));
  });
}

detectBtn.addEventListener('click', async ()=>{
  detectBtn.disabled = true;
  await sendDetection();
  detectBtn.disabled = false;
});

captureRegisterBtn.addEventListener('click', async ()=>{
  const c = captureFrame();
  c.toBlob((blob)=>{
    // put the blob into a hidden file input for the register form submission flow
    const file = new File([blob], 'capture.jpg', {type:'image/jpeg'});
    // create a temporary input and submit via fetch
    const fd = new FormData();
    fd.append('name', nameInput.value || 'NoName');
    fd.append('career', careerInput.value || 'SISTEMAS Y GESTION DE DATA');
    fd.append('image', file);
    fd.append('client_timestamp', new Date().toISOString());
    fetch('/api/register/', {method:'POST', body:fd}).then(r=>r.json()).then(d=>{
      alert('Registro completado');
      loadStudents();
    }).catch(err=>alert('Error al registrar: '+err.message));
  }, 'image/jpeg');
});

registerForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  captureRegisterBtn.click();
});

async function loadStudents(){
  const res = await fetch('/api/students/');
  const data = await res.json();
  studentsList.innerHTML = '';
  data.forEach(s=>{
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `${s.name} — ${s.career}`;
    studentsList.appendChild(li);
  });
}

startCamera();
// adjust overlay size after video starts
video.addEventListener('loadedmetadata', ()=>{
  overlay.width = video.videoWidth || overlay.width || 640;
  overlay.height = video.videoHeight || overlay.height || 480;
  overlay.style.width = (video.clientWidth || overlay.width) + 'px';
  overlay.style.height = (video.clientHeight || overlay.height) + 'px';
  try{ overlay.style.setProperty('transform', 'none', 'important'); }catch(e){}
  try{
    const cs = window.getComputedStyle(video).transform || 'none';
    console.debug('main.js loadedmetadata sizes', {videoClientW: video.clientWidth, videoVW: video.videoWidth, overlayW: overlay.width, transform: cs});
  }catch(e){ console.debug('main.js loadedmetadata sizes', {videoClientW: video.clientWidth, videoVW: video.videoWidth, overlayW: overlay.width}); }
});
loadStudents();

// Keep overlay matched to video size on resize/layout changes
function updateOverlaySizeMain(){
  try{
    const w = video.clientWidth || video.videoWidth || 640;
    const h = video.clientHeight || video.videoHeight || 480;
    overlay.width = w;
    overlay.height = h;
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
  }catch(e){ console.error('updateOverlaySizeMain error', e); }
}
window.addEventListener('resize', updateOverlaySizeMain);
if(window.ResizeObserver){
  try{
    const ro = new ResizeObserver(()=> updateOverlaySizeMain());
    ro.observe(video);
    ro.observe(overlay);
  }catch(e){ }
}
