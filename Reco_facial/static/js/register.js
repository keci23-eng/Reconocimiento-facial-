const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay && overlay.getContext ? overlay.getContext('2d') : null;
const captureRegisterBtn = document.getElementById('captureRegisterBtn');
const captureAndSendBtn = document.getElementById('captureAndSendBtn');
const nameInput = document.getElementById('nameInput');
const careerInput = document.getElementById('careerInput');
const emailInput = document.getElementById('emailInput');
const statusDiv = document.getElementById('status');
const imageInput = document.getElementById('imageInput');
const uploadBtn = document.getElementById('uploadBtn');

// helper to read CSRF cookie (used for fetch POSTs)
function getCookie(name) {
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return match ? match.pop() : '';
}

// guard to surface unexpected errors to the status area
window.addEventListener('error', function(e){
  try{ if(statusDiv) statusDiv.innerText = 'JS error: ' + (e && e.message); }catch(_){ }
});

// safe status setter used across the script (falls back to console)
function safeSetStatus(msg){
  try{
    const el = document.getElementById('status');
    if(el) el.innerText = msg;
    else console.log('[status]', msg);
  }catch(e){ console.log('[status error]', e); }
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{
    console.log('register.js loaded');
    console.log({video, overlay, ctx, captureRegisterBtn, captureAndSendBtn, nameInput, careerInput, statusDiv, imageInput, uploadBtn});
    // Indicación visible en la página para comprobar que el script se ejecutó
    if(statusDiv){
      statusDiv.innerText = 'register.js cargado (comprobación)';
      setTimeout(()=>{ if(statusDiv) statusDiv.innerText = 'Listo para capturar.'; }, 1500);
    }

    // re-query elements inside DOMContentLoaded in case they were missing earlier
    // (keeps previous references as fallback)
    const _captureRegisterBtn = document.getElementById('captureRegisterBtn') || captureRegisterBtn;
    const _captureAndSendBtn = document.getElementById('captureAndSendBtn') || captureAndSendBtn;
    const _nameInput = document.getElementById('nameInput') || nameInput;
    const _careerInput = document.getElementById('careerInput') || careerInput;
    const _emailInput = document.getElementById('emailInput') || emailInput;
    const _statusDiv = document.getElementById('status') || statusDiv;
    const _imageInput = document.getElementById('imageInput') || imageInput;

    // attach handlers
    function markInvalid(el){ try{ if(el) el.classList.add('is-invalid'); }catch(e){} }
    function clearInvalid(el){ try{ if(el) el.classList.remove('is-invalid'); }catch(e){} }

    function validateStudentInputs(){
      const name = (_nameInput && _nameInput.value) ? _nameInput.value.trim() : '';
      const career = (_careerInput && _careerInput.value) ? _careerInput.value.trim() : '';
      const allowedCareer = (_careerInput && _careerInput.dataset && _careerInput.dataset.allowedCareer) ? _careerInput.dataset.allowedCareer.trim().toUpperCase() : '';
      const email = (_emailInput && _emailInput.value) ? _emailInput.value.trim() : '';

      // clear previous invalid states
      clearInvalid(_nameInput);
      clearInvalid(_careerInput);
      clearInvalid(_emailInput);

      if(!name){ markInvalid(_nameInput); return {ok:false, field:_nameInput, message:'Por favor ingresa el nombre.'}; }
      if(!career){ markInvalid(_careerInput); return {ok:false, field:_careerInput, message:'Por favor ingresa la carrera.'}; }
      // enforce allowed career if provided
      if(allowedCareer && career.trim().toUpperCase() !== allowedCareer){
        markInvalid(_careerInput);
        return {ok:false, field:_careerInput, message:`Carrera no permitida. Debe ser: ${allowedCareer}`};
      }
      // simple email check
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!email){ markInvalid(_emailInput); return {ok:false, field:_emailInput, message:'Por favor ingresa un correo.'}; }
      if(!emailRe.test(email)){ markInvalid(_emailInput); return {ok:false, field:_emailInput, message:'Formato de correo inválido.'}; }
      return {ok:true, name, career, email};
    }

    if(_captureRegisterBtn){
      _captureRegisterBtn.addEventListener('click', async ()=>{
        // Capture current frame and send to API to register student
        try{
          const v = validateStudentInputs();
          if(!v.ok){ if(_statusDiv) _statusDiv.innerText = v.message; if(v.field) v.field.focus(); return; }

          if(_statusDiv) _statusDiv.innerText = 'Capturando imagen...';

          const canvas = captureFrame();
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          if(!blob){
            if(_statusDiv) _statusDiv.innerText = 'No se pudo generar la imagen capturada.';
            return;
          }

          const fd = new FormData();
          fd.append('name', v.name);
          fd.append('career', v.career);
          if(v.email) fd.append('correo', v.email);
          // use a sensible filename
          fd.append('image', blob, (name.replace(/\s+/g,'_') || 'capture') + '.png');

          // call helper to send
          await sendFormData(fd);
        }catch(e){
          console.error('capture+send error', e);
          if(_statusDiv) _statusDiv.innerText = 'Error al capturar/enviar: ' + (e && e.message ? e.message : e);
        }
      });
    } else {
      console.warn('captureRegisterBtn element not found');
    }

    // captureAndSendBtn removed from template; no handler attached here.

    // If there's a dedicated upload button on the page, attach navigation (safety)
    const _goUploadBtn = document.getElementById('goUploadBtn');
    if(_goUploadBtn){
      _goUploadBtn.addEventListener('click', (e)=>{
        // default anchor navigates; keep for progressive enhancement
      });
    }

    // start camera after attaching listeners
    startCamera().then(()=>{
      try{ const v = document.getElementById('video') || video; v.addEventListener('loadedmetadata', ()=>{ const ov = document.getElementById('overlay') || overlay; ov.width = v.videoWidth || 640; ov.height = v.videoHeight || 480; }); }catch(e){}
    });

  }catch(e){
    console.error('register.js init error', e);
    try{ if(statusDiv) statusDiv.innerText = 'register.js init error: ' + e.message; }catch(_){ }
  }
});

// modal helpers (look for elements after DOMContentLoaded)
function showSuccessModal(title, text){
  try{
    // only show if explicitly allowed (prevents accidental auto-show on page load)
    if(!window._allowStudentSuccessModal) {
      console.debug('showSuccessModal blocked (flag not set)');
      return;
    }
    const modal = document.getElementById('successModal');
    const t = document.getElementById('successModalTitle');
    const txt = document.getElementById('successModalText');
    if(t && title) t.textContent = title;
    if(txt && text) txt.textContent = text;
    if(modal) modal.style.display = 'block';
    // reset flag after showing
    window._allowStudentSuccessModal = false;
  }catch(e){ console.warn('showSuccessModal error', e); }
}
function hideSuccessModal(){
  try{ const modal = document.getElementById('successModal'); if(modal) modal.style.display = 'none'; }catch(e){ }
}

// attach close handler if present (safe to run now)
document.addEventListener('DOMContentLoaded', ()=>{
  const close = document.getElementById('successModalClose');
  if(close) close.addEventListener('click', ()=>{ hideSuccessModal(); });
  // also allow clicking outside to close (optional)
  const modal = document.getElementById('successModal');
  if(modal) modal.addEventListener('click', (e)=>{ if(e.target === modal) hideSuccessModal(); });
});

let pendingBlob = null;

async function startCamera(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{width:640, height:480}, audio:false});
    video.srcObject = stream;
    await video.play();
  }catch(err){
    safeSetStatus('No se puede acceder a la cámara: ' + err.message);
  }
}

function captureFrame(){
  const c = document.createElement('canvas');
  c.width = video.videoWidth || 640;
  c.height = video.videoHeight || 480;
  const cctx = c.getContext('2d');
  cctx.drawImage(video, 0, 0, c.width, c.height);
  return c;
}
// Note: handlers for capture/upload are attached inside DOMContentLoaded above.

// helper to send FormData
let sending = false;
async function sendFormData(fd){
  if(sending) return;
  sending = true;
  if(captureAndSendBtn) captureAndSendBtn.disabled = true;
  if(captureRegisterBtn) captureRegisterBtn.disabled = true;

  // ensure a client timestamp is present
  try{
    let hasTs = false;
    for(const pair of fd.entries()){
      if(pair[0] === 'client_timestamp') { hasTs = true; break; }
    }
    if(!hasTs) fd.append('client_timestamp', new Date().toISOString());
    for(const pair of fd.entries()){
      console.log('FormData:', pair[0], pair[1]);
    }
  }catch(e){ console.log('Could not iterate FormData', e); }

  try{
    const headers = {};
    const csrftoken = getCookie('csrftoken');
    if (csrftoken) headers['X-CSRFToken'] = csrftoken;

    const resp = await fetch('/api/register/', {method:'POST', body:fd, credentials: 'same-origin', headers});
    let text = await resp.text();
    let data = null;
    try{ data = JSON.parse(text); }catch(e){ data = null; }
    if(resp.status === 201){
      const sid = data && data.student_id ? ` (id ${data.student_id})` : '';
      safeSetStatus('Registro exitoso.' + sid);
      console.log('Register success', data);
      // show modal de éxito
      try{
        const title = 'Se ha registrado exitosamente';
        const text = (data && data.message) ? data.message : 'El estudiante fue almacenado correctamente en el sistema.';
        // allow modal to be shown and then call
        window._allowStudentSuccessModal = true;
        showSuccessModal(title, text + sid);
      }catch(e){ console.warn('could not show success modal', e); }
    } else {
      const errMsg = data && data.error ? data.error : (text || `HTTP ${resp.status}`);
      safeSetStatus('Error servidor: ' + errMsg);
      console.error('Register error', resp.status, text, data);
    }
  }catch(e){
    safeSetStatus('Error de red: ' + e.message);
    console.error('Network error sending register:', e);
  } finally {
    sending = false;
    if(captureAndSendBtn) captureAndSendBtn.disabled = false;
    if(captureRegisterBtn) captureRegisterBtn.disabled = false;
  }
}

startCamera().then(()=>{
  video.addEventListener('loadedmetadata', ()=>{
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
  });
});
