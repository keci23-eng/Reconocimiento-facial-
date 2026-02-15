// students_table.js -- load and manage students list, update and delete
function getCookie(name) {
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return match ? match.pop() : '';
}

async function loadStudents() {
  const table = document.getElementById('studentsTableBody');
  if(!table) return;
  table.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try{
    const resp = await fetch('/api/students/');
    let data = await resp.json();
    if(!Array.isArray(data)) data = [];
    if(data.length === 0){
      table.innerHTML = '<tr><td colspan="5">No hay estudiantes registrados.</td></tr>';
      return;
    }
    table.innerHTML = '';
    data.forEach(s => {
      const tr = document.createElement('tr');
      const imgUrl = s.image || '';
      const safeName = encodeURIComponent(escapeHtml(s.name || ''));
      const thumb = imgUrl ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:12px;color:#999">Sin foto</span>`;
      tr.innerHTML = `
        <td style="width:80px;"><div style="width:64px;height:64px;overflow:hidden;border-radius:6px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;">${thumb}</div></td>
        <td>${escapeHtml(s.name || '')}</td>
        <td>${escapeHtml(s.career || '')}</td>
        <td>${escapeHtml(s.correo || '')}</td>
        <td>
          <button class="btn btn-sm btn-primary me-1" onclick="openUpdate(${s.id})">Actualizar</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDelete(${s.id}, '${safeName}')">Eliminar</button>
        </td>
      `;
      table.appendChild(tr);
    });
  }catch(e){
    table.innerHTML = '<tr><td colspan="5">Error cargando estudiantes.</td></tr>';
    console.error(e);
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]; });
}

let pendingDeleteId = null;
function confirmDelete(id, name){
  pendingDeleteId = id;
  try{ name = decodeURIComponent(name); }catch(_){ }
  const el = document.getElementById('confirmDeleteName');
  if(el) el.textContent = name || ('ID ' + id);
  const modal = ensureModalInBody('confirmDeleteModal');
  if(modal) modal.style.display = 'flex';
}

async function deleteStudentConfirmed(){
  if(!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = null;
  try{
    const csrftoken = getCookie('csrftoken');
    const resp = await fetch('/api/students/' + id + '/', {method:'DELETE', headers: {'X-CSRFToken': csrftoken}});
    if(resp.ok){
      closeConfirmDelete();
      await loadStudents();
    } else {
      alert('Error eliminando estudiante');
    }
  }catch(e){ console.error(e); alert('Error de red'); }
}

function closeConfirmDelete(){
  pendingDeleteId = null;
  const modal = document.getElementById('confirmDeleteModal');
  if(modal) modal.style.display = 'none';
}

let currentEditingId = null;

async function openUpdate(id){
  // fetch student data
  try{
    const resp = await fetch('/api/students/' + id + '/');
    if(!resp.ok) return alert('Estudiante no encontrado');
    const s = await resp.json();
    currentEditingId = id;
    document.getElementById('editName').value = s.name || '';
    document.getElementById('editCareer').value = s.career || '';
    document.getElementById('editCorreo').value = s.correo || '';
    document.getElementById('editImage').value = null;
    const modal = ensureModalInBody('studentsModal');
    if(modal) modal.style.display = 'flex';
  }catch(e){ console.error(e); alert('Error cargando estudiante'); }
}

function closeModal(){
  const modal = document.getElementById('studentsModal');
  if(modal) modal.style.display = 'none';
  currentEditingId = null;
}

async function saveUpdate(){
  if(!currentEditingId) return;
  const fd = new FormData();
  fd.append('name', document.getElementById('editName').value);
  fd.append('career', document.getElementById('editCareer').value);
  fd.append('correo', document.getElementById('editCorreo').value);
  const file = document.getElementById('editImage').files[0];
  if(file) fd.append('image', file, file.name);

  try{
    const csrftoken = getCookie('csrftoken');
    const resp = await fetch('/api/students/' + currentEditingId + '/', {method:'POST', body: fd, headers: {'X-CSRFToken': csrftoken}});
    if(resp.ok){
      closeModal();
      await loadStudents();
    } else {
      const text = await resp.text();
      alert('Error actualizando: ' + text);
    }
  }catch(e){ console.error(e); alert('Error de red al actualizar'); }
}

// Ensure modal element is attached to document.body and styled as full-screen centered overlay
function ensureModalInBody(id){
  const modal = document.getElementById(id);
  if(!modal) return null;
  if(modal.parentNode !== document.body){
    document.body.appendChild(modal);
  }
  // overlay styles
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';
  modal.style.background = 'rgba(0,0,0,0.35)';
  // inner card
  const card = modal.querySelector('.modal-center-card') || modal.querySelector('.modal-pro-card');
  if(card){
    card.style.position = 'relative';
    card.style.zIndex = '10000';
    card.style.maxHeight = '90vh';
    card.style.overflow = 'auto';
  }
  return modal;
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ loadStudents(); }catch(e){ }
  const modalClose = document.getElementById('studentsModalClose');
  if(modalClose) modalClose.addEventListener('click', closeModal);
  const modalSave = document.getElementById('studentsModalSave');
  if(modalSave) modalSave.addEventListener('click', saveUpdate);
});
