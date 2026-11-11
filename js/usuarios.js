(async function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Solo administradores. Si no hay sesión o no es admin, guard() redirige o muestra el aviso y aquí no se sigue.
  var yo = await Auth.guard({ admin: true });

  var state = { users: [], funnels: [], q: '', f: 'all', loaded: false };
  var PANEL_URL = (window.APP && window.APP.PANEL_URL) || new URL('login.html', location.href).href;

  var ERR = {
    sesion_expirada: 'Tu sesión venció. Vuelve a entrar.',
    sin_permiso: 'No tienes permiso para hacer esto.',
    usuario_invalido: 'El usuario debe tener de 3 a 30 letras minúsculas, números, punto, guion o guion bajo, sin espacios.',
    falta_nombre: 'Escribe el nombre de la persona.',
    rol_invalido: 'Elige un rol.',
    funnels_invalidos: 'Los funnels no son válidos.',
    falta_funnels: 'Elige al menos un funnel (o “Todos”).',
    correo_invalido: 'El correo no parece válido.',
    whatsapp_invalido: 'El número de WhatsApp no es válido. Escríbelo con código de país, por ejemplo +51 900 000 000.',
    duplicado: 'Ya existe un usuario con ese nombre de usuario.',
    no_encontrado: 'Ese usuario ya no existe. Recarga la página.',
    no_a_ti_mismo: 'No puedes quitarte el rol de administrador, desactivarte ni borrarte a ti mismo.',
    ultimo_admin: 'Debe quedar al menos un administrador activo.',
    sin_correo: 'Esta persona no tiene correo registrado. Edítala para agregarlo.',
    usuario_desactivado: 'El usuario está desactivado. Actívalo primero.',
    url_invalida: 'La dirección del panel debe empezar con https://.',
    correo_fallido: 'Google no pudo enviar el correo. Revisa que hayas autorizado el envío (ver instrucciones) o la cuota diaria.',
    canal_invalido: 'Canal no válido.'
  };
  var errText = function (r) { return ERR[r && r.error] || 'No se pudo completar la acción. Inténtalo otra vez.'; };

  /* ---------- utilidades ---------- */
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iniciales(n) { var p = String(n).trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function color(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360; return 'hsl(' + h + ' 50% 45%)'; }
  function avatar(n) { return '<span class="avatar" style="--c:' + color(n) + '">' + esc(iniciales(n)) + '</span>'; }
  function toast(msg, bad) {
    var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, bad ? 6000 : 2800);
  }
  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); return true; }
    catch (e) {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
      ta.remove(); return ok;
    }
  }
  function funnelNombre(id) { var f = state.funnels.filter(function (x) { return String(x.category_id) === String(id); })[0]; return f ? f.funnel : 'Funnel ' + id; }
  function funnelsTexto(u) {
    if (u.rol === 'admin' || u.funnels === 'ALL') return 'Todos';
    return u.funnels.split(',').map(funnelNombre).join(', ');
  }
  function enviadoTexto(u) {
    if (!u.accesos_enviados) return '<span class="badge warn">Sin enviar</span>';
    var p = u.accesos_enviados.split(' · ');
    return '<span class="badge ok" title="' + esc(u.accesos_enviados) + '">Enviado ' + esc(p[0].slice(0, 5)) + '</span>';
  }
  function mensaje(u) {
    return 'Hola ' + u.nombre + ', estos son tus accesos al panel de llamadas:\n\nPanel: ' + PANEL_URL + '\nUsuario: ' + u.usuario +
      '\nContraseña: ' + u.password + '\n\nEsta contraseña es fija: guárdala y no la compartas. Si la olvidas, pídesela a un administrador.';
  }
  function setBusy(btn, busy, txt) {
    if (busy) { btn.dataset.t = btn.innerHTML; btn.disabled = true; if (txt) btn.textContent = txt; }
    else { btn.disabled = false; if (btn.dataset.t) btn.innerHTML = btn.dataset.t; }
  }

  /* ---------- barra superior ---------- */
  $('#meAv').outerHTML = avatar(yo.nombre).replace('class="avatar"', 'class="avatar" id="meAv"');
  $('#meNm').textContent = yo.nombre; $('#meName').textContent = yo.nombre;
  $('#themeBtn').addEventListener('click', Auth.toggleTheme);
  $('#logoutBtn').addEventListener('click', Auth.logout);
  $('#meBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var m = $('#meMenu'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden));
  });

  /* ---------- carga y tabla ---------- */
  async function cargar() {
    try {
      var r = await Auth.api('usuarios_listar');
      if (!r.ok) { toast(errText(r), true); return; }
      state.users = r.usuarios; state.funnels = r.funnels || []; state.loaded = true;
    } catch (e) { toast('No pudimos conectar con el servidor. Revisa tu conexión.', true); }
    pintar();
  }

  function visibles() {
    var q = state.q.trim().toLowerCase();
    return state.users.filter(function (u) {
      if (state.f === 'activo' && u.activo !== 'Sí') return false;
      if (state.f === 'desactivado' && u.activo === 'Sí') return false;
      if (!q) return true;
      return (u.nombre + ' ' + u.usuario + ' ' + u.correo).toLowerCase().indexOf(q) >= 0;
    });
  }

  function pintar() {
    var v = visibles();
    $('#rows').innerHTML = v.map(function (u) {
      var soyYo = u.usuario === String(yo.usuario).toLowerCase();
      return '<tr class="' + (u.activo === 'Sí' ? '' : 'off') + '" data-u="' + esc(u.usuario) + '">' +
        '<td><div class="person">' + avatar(u.nombre) + '<div><b>' + esc(u.nombre) + (soyYo ? ' <span>(tú)</span>' : '') + '</b><span>' + esc(u.usuario) + (u.correo ? ' · ' + esc(u.correo) : '') + '</span></div></div></td>' +
        '<td><span class="badge ' + (u.rol === 'admin' ? 'admin' : '') + '">' + (u.rol === 'admin' ? 'Administrador' : 'Usuario') + '</span></td>' +
        '<td class="fun">' + esc(funnelsTexto(u)) + '</td>' +
        '<td><div class="clave"><code data-pw="' + esc(u.password) + '">••••••••••••</code>' +
          '<button class="icon-btn" data-a="ver" aria-label="Mostrar contraseña" title="Mostrar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
          '<button class="icon-btn" data-a="copiar" aria-label="Copiar contraseña" title="Copiar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button></div></td>' +
        '<td>' + enviadoTexto(u) + '</td>' +
        '<td>' + (u.activo === 'Sí' ? '<span class="badge ok">Activo</span>' : '<span class="badge bad">Desactivado</span>') + '</td>' +
        '<td class="acts"><button class="btn sm" data-a="enviar"' + (u.activo === 'Sí' ? '' : ' disabled') + '>Enviar accesos</button><button class="btn sm" data-a="editar">Editar</button>' +
        '<span class="kebab"><button class="icon-btn" data-a="mas" aria-label="Más acciones" aria-haspopup="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button></span></td></tr>';
    }).join('');
    var e = $('#empty');
    e.hidden = v.length > 0;
    if (!v.length) e.textContent = state.loaded ? (state.users.length ? 'Ningún usuario coincide con la búsqueda.' : 'Todavía no hay usuarios.') : 'Cargando…';
  }

  var usuarioDe = function (el) { var tr = el.closest('tr'); return tr && state.users.filter(function (u) { return u.usuario === tr.dataset.u; })[0]; };
  function cerrarMenus() { $$('.menu.row-menu').forEach(function (m) { m.remove(); }); var m = $('#meMenu'); if (!m.hidden) { m.hidden = true; $('#meBtn').setAttribute('aria-expanded', 'false'); } }
  document.addEventListener('click', cerrarMenus);
  window.addEventListener('wheel', cerrarMenus, { passive: true }); window.addEventListener('touchmove', cerrarMenus, { passive: true }); window.addEventListener('resize', cerrarMenus);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenus(); });

  $('#rows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var u = usuarioDe(b); if (!u) return;
    var a = b.dataset.a;
    if (a === 'ver') {
      var c = b.parentNode.querySelector('code'), oculto = c.textContent.indexOf('•') === 0;
      c.textContent = oculto ? c.dataset.pw : '••••••••••';
    } else if (a === 'copiar') {
      copiar(u.password).then(function (ok) { toast(ok ? 'Contraseña copiada' : 'No se pudo copiar', !ok); });
    } else if (a === 'enviar') abrirAcceso(u);
    else if (a === 'editar') abrirForm(u);
    else if (a === 'mas') {
      e.stopPropagation(); var abierto = $('.row-menu') && $('.row-menu').dataset.de === u.usuario; cerrarMenus(); if (abierto) return;
      var soyYo = u.usuario === String(yo.usuario).toLowerCase();
      var m = document.createElement('div'); m.className = 'menu row-menu'; m.setAttribute('role', 'menu');
      m.innerHTML = '<button data-m="clave">Generar nueva contraseña</button>' + (soyYo ? '' : '<button class="bad" data-m="borrar">Eliminar usuario</button>');
      m.addEventListener('click', function (ev) {
        var x = ev.target.closest('[data-m]'); if (!x) return;
        if (x.dataset.m === 'clave') nuevaClave(u); else borrar(u);
      });
      // Flotante (fixed) para que la tabla con scroll no lo recorte
      var rc = b.getBoundingClientRect();
      m.dataset.de = u.usuario; m.style.position = 'fixed'; m.style.top = (rc.bottom + 6) + 'px'; m.style.right = Math.max(8, window.innerWidth - rc.right) + 'px';
      document.body.appendChild(m);
    }
  });

  $('#q').addEventListener('input', function () { state.q = this.value; pintar(); });
  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    state.f = b.dataset.f; $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); }); pintar();
  });

  /* ---------- diálogos ---------- */
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    $$('[data-close]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
  });

  function confirmar(titulo, texto, ok) {
    return new Promise(function (res) {
      var d = $('#dlgConfirm'); $('#cfTitle').textContent = titulo; $('#cfText').textContent = texto; $('#cfYes').textContent = ok || 'Confirmar';
      var fin = function (v) { d.removeEventListener('close', onClose); res(v); };
      var onClose = function () { fin(false); };
      $('#cfNo').onclick = function () { d.removeEventListener('close', onClose); d.close(); res(false); };
      $('#cfYes').onclick = function () { d.removeEventListener('close', onClose); d.close(); res(true); };
      d.addEventListener('close', onClose); d.showModal();
    });
  }

  /* ---------- crear / editar ---------- */
  var editando = null;
  function pintarFunnels(sel) {
    var todos = sel.indexOf('ALL') >= 0;
    $('#fFunnels').innerHTML = '<label class="fchk"><input type="checkbox" value="ALL"' + (todos ? ' checked' : '') + '> Todos</label>' +
      state.funnels.map(function (f) {
        return '<label class="fchk"><input type="checkbox" value="' + esc(f.category_id) + '"' + (!todos && sel.indexOf(String(f.category_id)) >= 0 ? ' checked' : '') + '> ' + esc(f.funnel) + '</label>';
      }).join('');
  }
  $('#fFunnels').addEventListener('change', function (e) {
    var t = e.target; if (t.type !== 'checkbox') return;
    var todos = $('#fFunnels input[value="ALL"]');
    if (t === todos && t.checked) $$('#fFunnels input').forEach(function (i) { if (i !== todos) i.checked = false; });
    else if (t !== todos && t.checked) todos.checked = false;
  });
  function actualizarRol() {
    var adm = $('#fRol').value === 'admin';
    $('#fFunnelsBox').hidden = adm; $('#fAdminHint').hidden = !adm;
  }
  $('#fRol').addEventListener('change', actualizarRol);

  function abrirForm(u) {
    editando = u || null;
    $('#formTitle').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
    $('#formSub').textContent = u ? 'La contraseña no cambia al guardar.' : 'Al guardar se genera su contraseña automáticamente.';
    $('#fNombre').value = u ? u.nombre : ''; $('#fUsuario').value = u ? u.usuario : ''; $('#fUsuario').readOnly = !!u;
    $('#fRol').value = u ? u.rol : 'usuario';
    $('#fCorreo').value = u ? u.correo : ''; $('#fWa').value = u ? u.whatsapp : '';
    $('#fActivoBox').hidden = !u; $('#fActivo').checked = u ? u.activo === 'Sí' : true;
    pintarFunnels(u ? (u.funnels === 'ALL' ? ['ALL'] : u.funnels.split(',')) : []);
    actualizarRol(); $('#formErr').textContent = ''; $('#formOk').textContent = u ? 'Guardar cambios' : 'Crear usuario';
    $('#dlgForm').showModal(); (u ? $('#fNombre') : $('#fNombre')).focus();
  }
  $('#newBtn').addEventListener('click', function () { abrirForm(null); });
  // El usuario se sugiere a partir del nombre mientras se escribe (solo al crear)
  $('#fNombre').addEventListener('input', function () {
    if (editando || $('#fUsuario').dataset.manual) return;
    var p = this.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(String);
    $('#fUsuario').value = p.length > 1 ? p[0] + '.' + p[p.length - 1] : (p[0] || '');
  });
  $('#fUsuario').addEventListener('input', function () { this.dataset.manual = '1'; });

  $('#form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#formErr'); err.textContent = '';
    var adm = $('#fRol').value === 'admin';
    var fs = $$('#fFunnels input:checked').map(function (i) { return i.value; });
    var reg = {
      usuario: $('#fUsuario').value, nombre: $('#fNombre').value, rol: $('#fRol').value,
      funnels: adm ? ['ALL'] : fs, correo: $('#fCorreo').value, whatsapp: $('#fWa').value,
      activo: editando ? ($('#fActivo').checked ? 'Sí' : 'No') : 'Sí'
    };
    var btn = $('#formOk'); setBusy(btn, true, 'Guardando…');
    try {
      var r = await Auth.api('usuarios_guardar', { registro: reg, editar: !!editando });
      if (!r.ok) { err.textContent = errText(r); return; }
      $('#dlgForm').close();
      await cargar();
      if (r.creado) { toast('Usuario creado'); abrirAcceso(r.usuario, true); }
      else toast('Cambios guardados');
    } catch (ex) { err.textContent = 'No pudimos conectar con el servidor. Inténtalo otra vez.'; }
    finally { setBusy(btn, false); }
  });

  /* ---------- enviar accesos ---------- */
  var accU = null;
  function abrirAcceso(u, nuevo) {
    accU = u;
    $('#accTitle').textContent = nuevo ? 'Usuario creado' : 'Enviar accesos';
    $('#accSub').textContent = u.nombre + (nuevo ? ' ya puede entrar. Envíale sus accesos ahora.' : '');
    $('#accCred').innerHTML = '<div><span>Panel</span><b>' + esc(PANEL_URL) + '</b></div><div><span>Usuario</span><b>' + esc(u.usuario) + '</b></div><div><span>Contraseña</span><b>' + esc(u.password) + '</b></div>';
    $('#sendMail').disabled = !u.correo; $('#sendMailTo').textContent = u.correo || 'sin correo';
    $('#sendWaTo').textContent = u.whatsapp || 'elegirás el contacto';
    $('#accErr').textContent = '';
    $('#dlgAccess').showModal();
  }
  async function registrarEnvio(canal) {
    var r = await Auth.api('usuarios_enviar', { usuario: accU.usuario, canal: canal, panel_url: PANEL_URL });
    if (r.ok) { var m = state.users.filter(function (x) { return x.usuario === accU.usuario; })[0]; if (m) { await cargar(); } }
    return r;
  }
  $('#sendMail').addEventListener('click', async function () {
    var b = this; $('#accErr').textContent = ''; setBusy(b, true, 'Enviando…');
    try {
      var r = await registrarEnvio('correo');
      if (r.ok) { toast('Accesos enviados a ' + accU.correo); $('#dlgAccess').close(); }
      else $('#accErr').textContent = errText(r) + (r.detalle ? ' (' + r.detalle + ')' : '');
    } catch (e) { $('#accErr').textContent = 'No pudimos conectar con el servidor.'; }
    finally { setBusy(b, false); $('#sendMail').disabled = !accU.correo; }
  });
  $('#sendWa').addEventListener('click', async function () {
    var num = (accU.whatsapp || '').replace(/\D/g, '');
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(mensaje(accU)), '_blank', 'noopener');
    try { await registrarEnvio('whatsapp'); } catch (e) {}
  });
  $('#sendCopy').addEventListener('click', async function () {
    var ok = await copiar(mensaje(accU));
    if (!ok) { $('#accErr').textContent = 'No se pudo copiar. Cópialo a mano desde los datos de arriba.'; return; }
    toast('Mensaje copiado'); try { await registrarEnvio('copia'); } catch (e) {}
  });

  /* ---------- nueva contraseña y eliminar ---------- */
  async function nuevaClave(u) {
    cerrarMenus();
    var si = await confirmar('¿Generar nueva contraseña?', u.nombre + ' dejará de poder entrar con la actual y se le cerrará la sesión abierta. Luego podrás enviarle la nueva.', 'Generar');
    if (!si) return;
    try {
      var r = await Auth.api('usuarios_clave', { usuario: u.usuario });
      if (!r.ok) { toast(errText(r), true); return; }
      await cargar(); toast('Nueva contraseña generada'); if (r.usuario.activo === 'Sí') abrirAcceso(r.usuario);
    } catch (e) { toast('No pudimos conectar con el servidor.', true); }
  }
  async function borrar(u) {
    cerrarMenus();
    var si = await confirmar('¿Eliminar a ' + u.nombre + '?', 'Su usuario se borra y se le cierra la sesión. Sus llamadas y su historial no se tocan. Si solo quieres que no entre, mejor desactívalo.', 'Eliminar');
    if (!si) return;
    try {
      var r = await Auth.api('usuarios_borrar', { usuario: u.usuario });
      if (!r.ok) { toast(errText(r), true); return; }
      await cargar(); toast('Usuario eliminado');
    } catch (e) { toast('No pudimos conectar con el servidor.', true); }
  }

  state.loaded = false; pintar(); cargar();
})();
