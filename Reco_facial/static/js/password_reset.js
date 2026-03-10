// password_reset.js
// Maneja: /password_forgot, /password_verify, /password_reset pages

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function getCSRFToken() {
  // intentar cookie primero, luego buscar input hidden del formulario
  let t = getCookie('csrftoken');
  if (t) return t;
  try{
    const el = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if(el) return el.value;
  }catch(e){}
  return null;
}

function showAlert(msg, type='info'){
  const a = document.getElementById('alert');
  if(!a) return;
  a.style.display = 'block';
  a.className = `alert alert-${type}`;
  a.textContent = msg;
}

// FORGOT
const forgotForm = document.getElementById('forgotForm');
if(forgotForm){
  forgotForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('email').value;
    const csrftoken = getCSRFToken();
    const fd = new FormData();
    fd.append('email', email);
    try{
      const headers = {};
      if(csrftoken) headers['X-CSRFToken'] = csrftoken;
      const res = await fetch('/password/forgot/', {method:'POST', body:fd, credentials:'same-origin', headers: headers});
      const data = await res.json();
      showAlert('Si el correo existe, se ha enviado un código. Revisa tu bandeja.', 'success');
      // redirigir a verificación facilitando email
      setTimeout(()=>{ window.location = '/password/verify-otp/?email='+encodeURIComponent(email); }, 1200);
    }catch(err){
      showAlert('Error enviando solicitud: '+err.message, 'danger');
    }
  });
}

// VERIFY
const verifyForm = document.getElementById('verifyForm');
if(verifyForm){
  // prefill email if in query
  const params = new URLSearchParams(window.location.search);
  const qemail = params.get('email');
  if(qemail){ document.getElementById('email').value = qemail; }

  verifyForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('email').value;
    const otp = document.getElementById('otp').value;
    const csrftoken = getCSRFToken();
    const fd = new FormData();
    fd.append('email', email);
    fd.append('otp', otp);
    try{
      const headers = {};
      if(csrftoken) headers['X-CSRFToken'] = csrftoken;
      const res = await fetch('/password/verify-otp/', {method:'POST', body:fd, credentials:'same-origin', headers: headers});
      const data = await res.json();
      if(data.ok){
        // recibimos reset_token -> redirigir a reset con token
        const token = encodeURIComponent(data.reset_token);
        window.location = '/password/reset/?token='+token;
      }else{
        showAlert(data.error || 'Código inválido', 'danger');
      }
    }catch(err){
      showAlert('Error verificando: '+err.message, 'danger');
    }
  });
}

// RESET
const resetForm = document.getElementById('resetForm');
if(resetForm){
  // prefill token from query if present
  const params = new URLSearchParams(window.location.search);
  const qtoken = params.get('token');
  if(qtoken){ document.getElementById('token').value = qtoken; }

  resetForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const token = document.getElementById('token').value;
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password2').value;
    const csrftoken = getCookie('csrftoken');
    const fd = new FormData();
    fd.append('token', token);
    fd.append('password', password);
    fd.append('password2', password2);
    try{
      const res = await fetch('/password/reset/', {method:'POST', body:fd, credentials:'same-origin', headers: {'X-CSRFToken': csrftoken}});
      const data = await res.json();
      if(data.ok){
        showAlert('Contraseña actualizada. Redirigiendo al login...', 'success');
        setTimeout(()=> window.location = '/login/', 1200);
      }else{
        showAlert(data.error || 'Error al cambiar la contraseña', 'danger');
      }
    }catch(err){
      showAlert('Error en la petición: '+err.message, 'danger');
    }
  });
}
