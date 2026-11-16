(async function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Solo administradores
  var yo = await Auth.guard({ admin: true });

  var state = { asesoras: [], equipos: [], marcas: [], funnels: [], q: '', marca: 'all', seccion: 'asesoras', loaded: false };
  var CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

  var ERR = {
    sesion_expirada: 'Tu sesión venció. Vuelve a entrar.',
    sin_permiso: 'No tienes permiso para hacer esto.',
    id_invalido: 'El ID de Bitrix son solo números (por ejemplo 84205).',
    falta_nombre: 'Escribe el nombre.',
    correo_invalido: 'Hay un correo que no parece válido.',
    duplicado: 'Ya existe uno con ese ID o ese nombre.',
    no_encontrada: 'Esa asesora ya no existe. Recarga la página.',
    no_encontrado: 'Ese equipo ya no existe. Recarga la página.',
    falta_marca: 'Elige la marca.',
    falta_equipo: 'Escribe el nombre del equipo.',
    funnels_invalidos: 'Los funnels no son válidos.',
    ya_hay_por_defecto: 'Esa marca ya tiene un equipo por defecto (sin funnels). Elige funnels para este o edita el otro.',
    funnel_repetido: 'Ese funnel ya está en otro equipo de la marca.'
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
  function setBusy(btn, busy, txt) {
    if (busy) { btn.dataset.t = btn.innerHTML; btn.disabled = true; if (txt) btn.textContent = txt; }
    else { btn.disabled = false; if (btn.dataset.t) btn.innerHTML = btn.dataset.t; }
  }
  function lista(texto) { return String(texto || '').split(/[\s,;]+/).filter(function (x) { return x; }); }
  function funnelNombre(id) { var f = state.funnels.filter(function (x) { return String(x.category_id) === String(id); })[0]; return f ? f.funnel : 'Funnel ' + id; }
  function mismaMarca(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

  /* ---------- barra superior ---------- */
  $('#meAv').outerHTML = avatar(yo.nombre).replace('class="avatar"', 'class="avatar" id="meAv"');
  $('#meNm').textContent = yo.nombre; $('#meName').textContent = yo.nombre;
  $('#themeBtn').addEventListener('click', Auth.toggleTheme);
  $('#logoutBtn').addEventListener('click', Auth.logout);
  $('#meBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var m = $('#meMenu'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden));
  });
  document.addEventListener('click', function () { var m = $('#meMenu'); if (!m.hidden) { m.hidden = true; $('#meBtn').setAttribute('aria-expanded', 'false'); } });

  /* ---------- carga ---------- */
  async function cargar() {
    try {
      var r = await Auth.api('equipo_listar');
      if (!r.ok) { $('#bannerErr').innerHTML = '<div class="warn-box">' + esc(errText(r)) + '</div>'; return; }
      state.asesoras = r.asesoras || []; state.equipos = r.equipos || []; state.funnels = r.funnels || [];
      var marcas = (r.marcas || []).slice();
      state.asesoras.concat(state.equipos).forEach(function (x) { if (x.marca && !marcas.some(function (m) { return mismaMarca(m, x.marca); })) marcas.push(x.marca); });
      state.marcas = marcas; state.loaded = true; $('#bannerErr').innerHTML = '';
    } catch (e) {
      $('#bannerErr').innerHTML = '<div class="warn-box">No pudimos cargar los datos. Revisa que el backend esté actualizado (Code.gs, nueva implementación) y tu conexión.</div>';
    }
    pintar();
  }

  /* ---------- pintar ---------- */
  function pintar() {
    $('#cntAs').textContent = state.loaded ? state.asesoras.length : '';
    $('#cntEq').textContent = state.loaded ? state.equipos.length : '';
    var asesoras = state.seccion === 'asesoras';
    $('#secAsesoras').hidden = !asesoras; $('#secEquipos').hidden = asesoras;
    $('#qBox').hidden = !asesoras;
    $('#newBtn').textContent = asesoras ? '+ Nueva asesora' : '+ Nuevo equipo';
    if (asesoras) pintarAsesoras(); else pintarEquipos();
  }

  function pintarAsesoras() {
    var marcasEn = [];
    state.asesoras.forEach(function (a) { var m = a.marca || 'Sin marca'; if (marcasEn.indexOf(m) < 0) marcasEn.push(m); });
    $('#marcaChips').innerHTML = marcasEn.length > 1
      ? '<button class="chip" data-m="all" aria-pressed="' + (state.marca === 'all') + '">Todas</button>' + marcasEn.map(function (m) {
        return '<button class="chip" data-m="' + esc(m) + '" aria-pressed="' + (state.marca === m) + '">' + esc(m) + '</button>';
      }).join('') : '';

    var q = state.q.trim().toLowerCase();
    var v = state.asesoras.filter(function (a) {
      if (state.marca !== 'all' && (a.marca || 'Sin marca') !== state.marca) return false;
      return !q || (a.nombre + ' ' + a.bitrix_id + ' ' + a.correo).toLowerCase().indexOf(q) >= 0;
    });
    $('#rowsAs').innerHTML = v.map(function (a) {
      return '<tr data-id="' + esc(a.bitrix_id) + '">' +
        '<td><div class="person">' + avatar(a.nombre) + '<div><b>' + esc(a.nombre) + '</b></div></div></td>' +
        '<td><code>' + esc(a.bitrix_id) + '</code></td>' +
        '<td>' + (a.correo ? esc(a.correo) : '<span class="badge warn">Sin correo</span>') + '</td>' +
        '<td>' + (a.marca ? '<span class="badge">' + esc(a.marca) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="acts"><button class="btn sm" data-a="editar">Editar</button><button class="btn sm" data-a="borrar">Eliminar</button></td></tr>';
    }).join('');
    var e = $('#emptyAs'); e.hidden = v.length > 0;
    if (!v.length) e.textContent = !state.loaded ? 'Cargando…' : (state.asesoras.length ? 'Ninguna asesora coincide con la búsqueda.' : 'Todavía no hay asesoras. Agrega la primera.');
  }

  function correosHtml(texto, cc) {
    var l = lista(texto);
    if (!l.length) return '<span class="none">—</span>';
    return l.map(function (c) { return '<span class="mail' + (cc ? ' cc' : '') + '">' + esc(c) + '</span>'; }).join('');
  }

  function pintarEquipos() {
    var box = $('#equiposLista');
    if (!state.loaded) { box.innerHTML = '<div class="empty">Cargando…</div>'; return; }
    if (!state.equipos.length) { box.innerHTML = '<div class="card"><div class="empty">Todavía no hay equipos. Crea el primero con “+ Nuevo equipo”.</div></div>'; return; }
    var marcas = [];
    state.equipos.forEach(function (e) { if (marcas.indexOf(e.marca) < 0) marcas.push(e.marca); });
    box.innerHTML = marcas.map(function (m) {
      return state.equipos.filter(function (e) { return e.marca === m; }).map(function (e) {
        var fs = lista(String(e.funnels).replace(/,/g, ' '));
        var funnelsTxt = fs.length ? fs.map(funnelNombre).join(', ') : '';
        return '<div class="eq-card" data-m="' + esc(e.marca) + '" data-e="' + esc(e.equipo) + '">' +
          '<div class="eq-head"><div><h3>' + esc(e.equipo) + ' <span class="badge">' + esc(e.marca) + '</span></h3>' +
          '<div class="sub-m">' + (fs.length ? 'Funnels: ' + esc(funnelsTxt) : '<span class="badge ok">Por defecto</span> Funnels de la marca sin equipo propio') + '</div></div>' +
          '<div><button class="btn sm" data-a="editar">Editar</button> <button class="btn sm" data-a="borrar">Eliminar</button></div></div>' +
          '<div class="eq-grid">' +
          '<div><h4>Cita · Para</h4><div class="eq-lista">' + correosHtml(e.para_cita) + '</div></div>' +
          '<div><h4>Cita · Con copia</h4><div class="eq-lista">' + correosHtml(e.copia_cita, true) + '</div></div>' +
          '<div><h4>Seguimiento · Para</h4><div class="eq-lista">' + correosHtml(e.para_seguimiento) + '</div></div>' +
          '<div><h4>Seguimiento · Con copia</h4><div class="eq-lista">' + correosHtml(e.copia_seguimiento, true) + '</div></div>' +
          '</div></div>';
      }).join('');
    }).join('');
  }

  /* ---------- eventos de la página ---------- */
  $('#seccion').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    state.seccion = b.dataset.s; $$('#seccion .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); }); pintar();
  });
  $('#marcaChips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.marca = b.dataset.m; pintarAsesoras(); } });
  $('#q').addEventListener('input', function () { state.q = this.value; pintarAsesoras(); });
  $('#newBtn').addEventListener('click', function () { if (state.seccion === 'asesoras') abrirAsesora(null); else abrirEquipo(null); });

  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    $$('[data-close]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
  });

  function confirmar(titulo, texto, ok) {
    return new Promise(function (res) {
      var d = $('#dlgConfirm'); $('#cfTitle').textContent = titulo; $('#cfText').textContent = texto; $('#cfYes').textContent = ok || 'Confirmar';
      var onClose = function () { res(false); };
      $('#cfNo').onclick = function () { d.removeEventListener('close', onClose); d.close(); res(false); };
      $('#cfYes').onclick = function () { d.removeEventListener('close', onClose); d.close(); res(true); };
      d.addEventListener('close', onClose); d.showModal();
    });
  }

  /* ---------- asesoras: crear / editar / eliminar ---------- */
  var editandoAs = null;
  function opcionesMarca(sel, valor, vacia) {
    var marcas = state.marcas.slice();
    if (valor && !marcas.some(function (m) { return mismaMarca(m, valor); })) marcas.push(valor);
    sel.innerHTML = (vacia ? '<option value="">' + vacia + '</option>' : '') + marcas.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    sel.value = valor || '';
  }
  function abrirAsesora(a) {
    editandoAs = a || null;
    $('#asTitle').textContent = a ? 'Editar asesora' : 'Nueva asesora';
    $('#aNombre').value = a ? a.nombre : ''; $('#aId').value = a ? a.bitrix_id : ''; $('#aCorreo').value = a ? a.correo : '';
    opcionesMarca($('#aMarca'), a ? a.marca : '', 'Sin marca');
    $('#errAs').textContent = ''; $('#okAs').textContent = a ? 'Guardar cambios' : 'Crear asesora';
    $('#dlgAs').showModal(); $('#aNombre').focus();
  }
  $('#rowsAs').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var id = b.closest('tr').dataset.id, a = state.asesoras.filter(function (x) { return x.bitrix_id === id; })[0]; if (!a) return;
    if (b.dataset.a === 'editar') return abrirAsesora(a);
    var si = await confirmar('¿Eliminar a ' + a.nombre + '?', 'Sale de la lista de asesoras. Sus negociaciones anteriores se conservan, pero las nuevas llamadas ya no mostrarán su nombre por el ID ' + a.bitrix_id + '.', 'Eliminar');
    if (!si) return;
    try {
      var r = await Auth.api('asesoras_borrar', { bitrix_id: a.bitrix_id });
      if (!r.ok) { toast(errText(r), true); return; }
      await cargar(); toast('Asesora eliminada');
    } catch (ex) { toast('No pudimos conectar con el servidor.', true); }
  });
  $('#formAs').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#errAs'); err.textContent = '';
    var reg = { bitrix_id: $('#aId').value, nombre: $('#aNombre').value, correo: $('#aCorreo').value, marca: $('#aMarca').value };
    var btn = $('#okAs'); setBusy(btn, true, 'Guardando…');
    try {
      var r = await Auth.api('asesoras_guardar', { registro: reg, original: editandoAs ? editandoAs.bitrix_id : '' });
      if (!r.ok) { err.textContent = errText(r); return; }
      $('#dlgAs').close(); await cargar(); toast(editandoAs ? 'Cambios guardados' : 'Asesora creada');
    } catch (ex) { err.textContent = 'No pudimos conectar con el servidor. Inténtalo otra vez.'; }
    finally { setBusy(btn, false); }
  });

  /* ---------- equipos: lista de correos con chips ---------- */
  // Muestra cada correo como una etiqueta que se puede quitar. Se escribe uno y Enter, o se elige una asesora.
  function listaCorreos(box) {
    var items = [];
    // Acepta uno o varios correos separados por coma, punto y coma o espacio. Si alguno está mal, no agrega ninguno.
    function agregar(texto) {
      var correos = lista(String(texto || '').toLowerCase());
      if (correos.some(function (c) { return !CORREO.test(c); })) return false;
      correos.forEach(function (c) { if (items.indexOf(c) < 0) items.push(c); });
      return true;
    }
    function pintarLista(foco) {
      var conCorreo = state.asesoras.filter(function (a) { return a.correo && items.indexOf(a.correo.toLowerCase()) < 0; });
      box.innerHTML = items.map(function (c) { return '<span class="mail">' + esc(c) + '<button type="button" data-q="' + esc(c) + '" aria-label="Quitar ' + esc(c) + '">×</button></span>'; }).join('') +
        '<input type="text" inputmode="email" autocapitalize="none" autocomplete="off" placeholder="' + (items.length ? 'Agregar otro…' : 'Escribe un correo y pulsa Enter') + '" aria-label="Agregar correo">' +
        (conCorreo.length ? '<select aria-label="Agregar una asesora"><option value="">+ Asesora</option>' + conCorreo.map(function (a) { return '<option value="' + esc(a.correo) + '">' + esc(a.nombre) + '</option>'; }).join('') + '</select>' : '');
      var inp = $('input', box);
      function confirmarTexto() { var ok = agregar(inp.value); if (ok) { inp.value = ''; pintarLista(true); } else { inp.classList.add('mal'); inp.style.color = 'var(--bad)'; } return ok; }
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') { if (inp.value.trim()) { e.preventDefault(); confirmarTexto(); } else if (e.key === 'Enter') e.preventDefault(); }
        else if (e.key === 'Backspace' && !inp.value && items.length) { items.pop(); pintarLista(true); }
        else inp.style.color = '';
      });
      inp.addEventListener('paste', function (e) {
        var t = (e.clipboardData || window.clipboardData).getData('text');
        if (/[\s,;]/.test(t.trim())) { e.preventDefault(); if (agregar(t)) pintarLista(true); else { inp.value = t.trim(); inp.style.color = 'var(--bad)'; } }
      });
      inp.addEventListener('blur', function () { if (inp.value.trim()) confirmarTexto(); });
      var sel = $('select', box);
      if (sel) sel.addEventListener('change', function () { agregar(sel.value); pintarLista(false); });
      if (foco) $('input', box).focus();
    }
    box.addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]'); if (!q) return;
      items = items.filter(function (c) { return c !== q.dataset.q; }); pintarLista(false);
    });
    return {
      set: function (texto) { items = []; lista(texto).forEach(agregar); pintarLista(false); },
      valor: function () { var inp = $('input', box); if (inp && inp.value.trim() && !agregar(inp.value)) return null; return items.join(', '); }
    };
  }
  var ci = {
    paraCita: listaCorreos($('#ciParaCita')), copiaCita: listaCorreos($('#ciCopiaCita')),
    paraSeg: listaCorreos($('#ciParaSeg')), copiaSeg: listaCorreos($('#ciCopiaSeg'))
  };

  /* ---------- equipos: crear / editar / eliminar ---------- */
  var editandoEq = null;
  function pintarFunnelsEquipo(seleccion) {
    var marca = $('#eMarca').value;
    var propios = state.funnels.filter(function (f) { return mismaMarca(f.marca, marca); });
    seleccion.forEach(function (id) { if (!propios.some(function (f) { return String(f.category_id) === id; })) propios.push({ category_id: id, funnel: funnelNombre(id) }); });
    var ocupados = {};
    state.equipos.forEach(function (e) {
      if (!mismaMarca(e.marca, marca) || (editandoEq && e.marca === editandoEq.marca && e.equipo === editandoEq.equipo)) return;
      lista(String(e.funnels).replace(/,/g, ' ')).forEach(function (id) { ocupados[id] = e.equipo; });
    });
    $('#eFunnels').innerHTML = propios.map(function (f) {
      var id = String(f.category_id), usado = ocupados[id];
      return '<label class="fchk' + (usado ? ' off' : '') + '"' + (usado ? ' title="Ya está en el equipo ' + esc(usado) + '"' : '') + '><input type="checkbox" value="' + esc(id) + '"' +
        (seleccion.indexOf(id) >= 0 ? ' checked' : '') + (usado ? ' disabled' : '') + '> ' + esc(f.funnel) + '</label>';
    }).join('');
    $('#eFunnelsHint').textContent = propios.length
      ? 'Sin elegir ninguno, este será el equipo por defecto de ' + (marca || 'la marca') + ' (recibe los funnels que no tengan equipo propio).'
      : 'Esta marca no tiene funnels en la hoja “Funnels”. Este será su equipo por defecto.';
  }
  function abrirEquipo(e) {
    editandoEq = e ? { marca: e.marca, equipo: e.equipo } : null;
    $('#eqTitle').textContent = e ? 'Editar equipo' : 'Nuevo equipo';
    opcionesMarca($('#eMarca'), e ? e.marca : (state.marcas[0] || ''));
    $('#eNombre').value = e ? e.equipo : '';
    pintarFunnelsEquipo(e ? lista(String(e.funnels).replace(/,/g, ' ')) : []);
    ci.paraCita.set(e ? e.para_cita : ''); ci.copiaCita.set(e ? e.copia_cita : '');
    ci.paraSeg.set(e ? e.para_seguimiento : ''); ci.copiaSeg.set(e ? e.copia_seguimiento : '');
    $('#errEq').textContent = ''; $('#okEq').textContent = e ? 'Guardar cambios' : 'Crear equipo';
    $('#dlgEq').showModal(); $('#eNombre').focus();
  }
  $('#eMarca').addEventListener('change', function () { pintarFunnelsEquipo([]); });
  $('#equiposLista').addEventListener('click', async function (ev) {
    var b = ev.target.closest('[data-a]'); if (!b) return;
    var card = b.closest('.eq-card');
    var e = state.equipos.filter(function (x) { return x.marca === card.dataset.m && x.equipo === card.dataset.e; })[0]; if (!e) return;
    if (b.dataset.a === 'editar') return abrirEquipo(e);
    var si = await confirmar('¿Eliminar el equipo ' + e.equipo + '?', 'Los leads de sus funnels dejarán de enviar correo hasta que otro equipo (o el equipo por defecto de ' + e.marca + ') los cubra.', 'Eliminar');
    if (!si) return;
    try {
      var r = await Auth.api('equipos_borrar', { marca: e.marca, equipo: e.equipo });
      if (!r.ok) { toast(errText(r), true); return; }
      await cargar(); toast('Equipo eliminado');
    } catch (ex) { toast('No pudimos conectar con el servidor.', true); }
  });
  $('#formEq').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var err = $('#errEq'); err.textContent = '';
    var v = { paraCita: ci.paraCita.valor(), copiaCita: ci.copiaCita.valor(), paraSeg: ci.paraSeg.valor(), copiaSeg: ci.copiaSeg.valor() };
    if (Object.keys(v).some(function (k) { return v[k] === null; })) { err.textContent = 'Hay un correo escrito que no parece válido. Corrígelo o bórralo.'; return; }
    var reg = {
      marca: $('#eMarca').value, equipo: $('#eNombre').value,
      funnels: $$('#eFunnels input:checked').map(function (i) { return i.value; }),
      para_cita: v.paraCita, copia_cita: v.copiaCita, para_seguimiento: v.paraSeg, copia_seguimiento: v.copiaSeg
    };
    var btn = $('#okEq'); setBusy(btn, true, 'Guardando…');
    try {
      var r = await Auth.api('equipos_guardar', { registro: reg, original: editandoEq });
      if (!r.ok) { err.textContent = errText(r); return; }
      $('#dlgEq').close(); await cargar(); toast(editandoEq ? 'Cambios guardados' : 'Equipo creado');
    } catch (ex) { err.textContent = 'No pudimos conectar con el servidor. Inténtalo otra vez.'; }
    finally { setBusy(btn, false); }
  });

  pintar(); cargar();
})();
