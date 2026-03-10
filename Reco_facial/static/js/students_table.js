// static/js/students_table.js

function getCookie(name) {
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return match ? match.pop() : '';
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"
  }[m]));
}

async function loadStudents() {
  const table = document.getElementById('studentsTableBody');
  if(!table) return;

  table.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

  try{
    const resp = await fetch('/api/students/');
    let data = await resp.json();
    if(!Array.isArray(data)) data = [];

    if(data.length === 0){
      table.innerHTML = '<tr><td colspan="6">No hay estudiantes registrados.</td></tr>';
      return;
    }

    table.innerHTML = '';

    data.forEach(s => {
      const tr = document.createElement('tr');
      const imgUrl = s.image || '';
      const estadoActivo = Number(s.activo) === 1;

      const thumb = imgUrl
        ? `<img src="${imgUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;">`
        : `<span style="font-size:12px;color:#999">Sin foto</span>`;

      const estadoBadge = estadoActivo
        ? `<span class="badge bg-success">Activo</span>`
        : `<span class="badge bg-secondary">Desactivado</span>`;

           tr.innerHTML = `
        <td style="width:90px;">
          <div class="student-photo">
            ${thumb}
          </div>
        </td>

        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.career)}</td>
        <td>${escapeHtml(s.correo)}</td>

        <td class="cell-state">
          ${estadoBadge}
        </td>

        <td class="cell-actions">
          <div class="actions-cell">
            <button class="btn btn-sm btn-primary" onclick="openUpdate(${s.id})">Actualizar</button>

            ${
              estadoActivo
              ? `<button class="btn btn-sm btn-warning" onclick="confirmDeactivate(${s.id}, '${encodeURIComponent(s.name || '')}')">Desactivar</button>`
              : `<button class="btn btn-sm btn-success" onclick="activateStudent(${s.id})">Activar</button>`
            }
          </div>
        </td>
      `;


      table.appendChild(tr);
    });

  }catch(e){
    console.error(e);
    table.innerHTML = '<tr><td colspan="6">Error cargando estudiantes.</td></tr>';
  }
}

/* =========================
   DESACTIVAR / ACTIVAR
========================= */

let pendingDeactivateId = null;

function confirmDeactivate(id, nameEncoded){
  pendingDeactivateId = id;

  let name = '';
  try { name = decodeURIComponent(nameEncoded || ''); } catch(_) { name = nameEncoded || ''; }

  const nameSpan = document.getElementById('confirmDeleteName');
  if(nameSpan) nameSpan.textContent = name || ('ID ' + id);

  const modal = document.getElementById('confirmDeleteModal');
  if(modal) modal.style.display = 'flex';

  // Cambiar texto del modal a "desactivar"
  const card = modal?.querySelector('.modal-center-card');
  if(card){
    const title = card.querySelector('div');
    if(title) title.textContent = 'Confirmar desactivación';

    const msg = card.querySelector('div + div');
    if(msg) msg.innerHTML = `¿Seguro que quieres desactivar a <span id="confirmDeleteName">${escapeHtml(name)}</span>? Esta acción lo dejará inactivo.`;

    const btnDanger = card.querySelector('button.btn-danger');
    if(btnDanger) btnDanger.textContent = 'Desactivar';
  }
}

async function deleteStudentConfirmed(){
  // En tu HTML este botón llama a deleteStudentConfirmed()
  if(!pendingDeactivateId) return;

  const id = pendingDeactivateId;
  pendingDeactivateId = null;

  try{
    const csrftoken = getCookie('csrftoken');
    const fd = new FormData();
    fd.append('activo', '0');

    const resp = await fetch('/api/students/' + id + '/', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: {'X-CSRFToken': csrftoken}
    });

    if(resp.ok){
      closeConfirmDelete();
      await loadStudents();
    } else {
      const txt = await resp.text();
      alert('Error desactivando: ' + txt);
    }
  }catch(e){
    console.error(e);
    alert('Error de red al desactivar');
  }
}

async function activateStudent(id){
  try{
    const csrftoken = getCookie('csrftoken');
    const fd = new FormData();
    fd.append('activo', '1');

    const resp = await fetch('/api/students/' + id + '/', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: {'X-CSRFToken': csrftoken}
    });

    if(resp.ok){
      await loadStudents();
    } else {
      const txt = await resp.text();
      alert('Error activando: ' + txt);
    }
  }catch(e){
    console.error(e);
    alert('Error de red al activar');
  }
}

function closeConfirmDelete(){
  pendingDeactivateId = null;
  const modal = document.getElementById('confirmDeleteModal');
  if(modal) modal.style.display = 'none';
}

/* =========================
   ACTUALIZAR (MODAL)
========================= */

let currentEditingId = null;

async function openUpdate(id){
  try{
    const resp = await fetch('/api/students/' + id + '/');
    if(!resp.ok) return alert('Estudiante no encontrado');

    const s = await resp.json();
    currentEditingId = id;

    document.getElementById('editName').value = s.name || '';
    document.getElementById('editCareer').value = s.career || '';
    document.getElementById('editCorreo').value = s.correo || '';
    const imgInput = document.getElementById('editImage');
    if(imgInput) imgInput.value = null;

    const modal = document.getElementById('studentsModal');
    if(modal) modal.style.display = 'flex';
  }catch(e){
    console.error(e);
    alert('Error cargando estudiante');
  }
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

  const file = document.getElementById('editImage')?.files?.[0];
  if(file) fd.append('image', file, file.name);

  try{
    const csrftoken = getCookie('csrftoken');
    const resp = await fetch('/api/students/' + currentEditingId + '/', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: {'X-CSRFToken': csrftoken}
    });

    if(resp.ok){
      closeModal();
      await loadStudents();
    } else {
      const text = await resp.text();
      alert('Error actualizando: ' + text);
    }
  }catch(e){
    console.error(e);
    alert('Error de red al actualizar');
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ loadStudents(); }catch(e){}

  const modalClose = document.getElementById('studentsModalClose');
  if(modalClose) modalClose.addEventListener('click', closeModal);

  const modalSave = document.getElementById('studentsModalSave');
  if(modalSave) modalSave.addEventListener('click', saveUpdate);
});
