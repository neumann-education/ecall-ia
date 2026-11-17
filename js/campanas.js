(async function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Solo administradores. Si no hay sesión o no es admin, guard() redirige o muestra el aviso y aquí no se sigue.
  var yo = await Auth.guard({ admin: true });

  var MAX_FILAS = 6000;
  var TANDA = 700;
  var RESERVADAS = ['customer_name', 'nombre', 'programa_interes', 'celular'];

  var state = { campanas: [], info: {}, numeros: [], f: 'all', loaded: false };
  var csv = null; // { cabeceras: [], filas: [[...]] }

  var ERR = {
    sesion_expirada: 'Tu sesión venció. Vuelve a entrar.',
    sin_permiso: 'No tienes permiso para hacer esto.',
    nombre_invalido: 'El nombre debe tener entre 3 y 60 caracteres.',
    nombre_repetido: 'Ya existe una campaña con ese nombre. Usa otro.',
    prefijo_invalido: 'El código de país debe tener solo números (hasta 4).',
    numero_no_existe: 'Ese número ya no existe en Marcas y números.',
    numero_desactivado: 'Ese número está desactivado.',
    numero_solo_entrante: 'Ese número es solo para llamadas entrantes.',
    numero_sin_agente: 'Ese número no tiene un agente de Retell configurado (Marcas y números).',
    tanda_invalida: 'No se pudo procesar una parte del archivo.',
    no_encontrada: 'La campaña ya no existe. Recarga la página.',
    campana_cerrada: 'Esa campaña ya no admite más contactos.',
    estado_no_permite: 'La campaña cambió de estado. Recarga la página.',
    sin_contactos: 'La campaña no tiene contactos válidos.',
    accion_invalida: 'Acción no válida.'
  };
  var errText = function (r) { return ERR[r && r.error] || ('No se pudo completar la acción.' + (r && r.error ? ' Detalle: ' + r.error : ' Inténtalo otra vez.')); };

  /* ---------- utilidades ---------- */
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('es-PE'); }
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
  function fecha(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function minutosTexto(m) {
    if (m % 1440 === 0) return '+' + (m / 1440) + (m / 1440 === 1 ? ' día' : ' días');
    if (m % 60 === 0) return '+' + (m / 60) + ' h';
    return '+' + m + ' min';
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
  document.addEventListener('click', function () { var m = $('#meMenu'); if (!m.hidden) { m.hidden = true; $('#meBtn').setAttribute('aria-expanded', 'false'); } });

  /* ---------- carga y tabla ---------- */
  async function cargar(silencioso) {
    try {
      var r = await Auth.api('campanas_listar');
      if (!r.ok) { if (!silencioso) toast(errText(r), true); return; }
      state.campanas = r.campanas; state.info = r; state.loaded = true;
    } catch (e) { if (!silencioso) toast('No pudimos conectar con el servidor. Revisa tu conexión.', true); }
    pintar();
  }

  function visibles() {
    return state.campanas.filter(function (c) {
      var cerrada = c.estado === 'Terminada' || c.estado === 'Cancelada';
      if (state.f === 'curso') return !cerrada;
      if (state.f === 'cerradas') return cerrada;
      return true;
    });
  }

  function badgeEstado(e) {
    var clase = { Activa: 'ok', Lista: 'warn', Pausada: 'warn', Cancelada: 'bad', Terminada: 'admin' }[e] || '';
    var texto = { Lista: 'Lista para iniciar', Borrador: 'Subiendo…' }[e] || e;
    return '<span class="badge ' + clase + '">' + esc(texto) + '</span>';
  }

  function avance(c) {
    var t = c.total || 1;
    var hechos = c.contesto + c.agotado + c.otros;
    var pct = function (n) { return (n * 100 / t).toFixed(2) + '%'; };
    return '<div class="prog"><div class="bar-prog" title="Contestaron / sin respuesta / en reintento">' +
      '<i class="p-ok" style="width:' + pct(c.contesto) + '"></i><i class="p-no" style="width:' + pct(c.agotado + c.otros) + '"></i><i class="p-re" style="width:' + pct(c.en_reintento) + '"></i></div>' +
      '<div class="prog-txt"><b>' + num(hechos) + '</b> de ' + num(c.total) + ' terminados · ' + num(c.contesto) + ' contestaron' +
      (c.en_reintento ? ' · ' + num(c.en_reintento) + ' en reintento' : '') + (c.sin_llamar ? ' · ' + num(c.sin_llamar) + ' sin llamar' : '') + '</div></div>';
  }

  function botones(c) {
    var h = '';
    if (c.estado === 'Lista') h += '<button class="btn sm primary" data-a="iniciar">Iniciar</button>';
    if (c.estado === 'Activa') h += '<button class="btn sm" data-a="pausar">Pausar</button>';
    if (c.estado === 'Pausada') h += '<button class="btn sm primary" data-a="reanudar">Reanudar</button>';
    if (['Borrador', 'Lista', 'Activa', 'Pausada'].indexOf(c.estado) >= 0) h += '<button class="btn sm" data-a="cancelar">Cancelar</button>';
    if (c.estado !== 'Borrador') h += '<button class="btn sm" data-a="resultados">Resultados</button>';
    return h;
  }

  var pg = (function () { var t = $('#rows'), w = t.closest('.scroll') || t.closest('table'); var d = document.createElement('div'); w.parentNode.insertBefore(d, w.nextSibling); var g = Pager.make(d); g.onChange(function () { pintar(); }); return g; })();
  function pintar() {
    var v = visibles();
    $('#rows').innerHTML = pg.slice(v, state.f).map(function (c) {
      return '<tr data-c="' + esc(c.campana_id) + '">' +
        '<td><div class="camp-name"><b>' + esc(c.nombre) + '</b><span>' + esc(c.marca) + ' · ' + esc(c.numero) + '</span></div></td>' +
        '<td>' + badgeEstado(c.estado) + '</td>' +
        '<td>' + avance(c) + '</td>' +
        '<td class="col-creada creada">' + esc(fecha(c.creada)) + '<span>' + esc(c.creada_por) + '</span></td>' +
        '<td class="acts">' + botones(c) + '</td></tr>';
    }).join('');
    var e = $('#empty');
    e.hidden = v.length > 0;
    if (!v.length) e.textContent = state.loaded ? (state.campanas.length ? 'No hay campañas en esta vista.' : 'Todavía no hay campañas. Crea la primera con “Nueva campaña”.') : 'Cargando…';
    pintarAvisos();
  }

  function pintarAvisos() {
    var d = state.info, av = [];
    var activas = state.campanas.some(function (c) { return c.estado === 'Activa'; });
    if (activas && d.sin_clave_retell) av.push(['bad', 'Falta guardar la clave de Retell (RETELL_API_KEY) en las propiedades del script de Apps Script. Sin ella no se puede llamar.']);
    if (activas && (d.segundos_desde_despacho === null || d.segundos_desde_despacho > 180)) {
      av.push(['bad', 'El despachador no está corriendo. En Apps Script ejecuta una vez la función instalarDisparadorCampanas().']);
    }
    if (d.pausa_global) av.push(['warn', 'Las llamadas están en pausa (Ajustes → Pausa). Las campañas no llamarán hasta que la quites.']);
    else if (activas && d.fuera_de_horario) av.push(['', 'Ahora estamos fuera del horario de llamadas (' + d.hora_desde + ':00 a ' + d.hora_hasta + ':00, hora de Lima). Se reanuda solo.']);
    if (activas && d.error_despacho) av.push(['warn', 'Último aviso al iniciar llamadas: ' + d.error_despacho]);
    $('#avisos').innerHTML = av.map(function (a) { return '<div class="aviso ' + a[0] + '">' + esc(a[1]) + '</div>'; }).join('');
  }

  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    state.f = b.dataset.f; $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); }); pintar();
  });

  setInterval(function () { if (!document.hidden && !$('dialog[open]')) cargar(true); }, 20000);

  /* ---------- diálogos ---------- */
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d && d.id !== 'dlgNueva') d.close(); });
    $$('[data-close]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
  });

  function confirmar(titulo, texto, ok, peligro) {
    return new Promise(function (res) {
      var d = $('#dlgConfirm'); $('#cfTitle').textContent = titulo; $('#cfText').textContent = texto;
      var si = $('#cfYes'); si.textContent = ok || 'Confirmar'; si.className = 'btn ' + (peligro ? 'danger' : 'primary');
      var onClose = function () { res(false); };
      $('#cfNo').onclick = function () { d.removeEventListener('close', onClose); d.close(); res(false); };
      si.onclick = function () { d.removeEventListener('close', onClose); d.close(); res(true); };
      d.addEventListener('close', onClose, { once: true }); d.showModal();
    });
  }

  /* ---------- acciones sobre una campaña ---------- */
  var campanaDe = function (el) { var tr = el.closest('tr'); return tr && state.campanas.filter(function (c) { return c.campana_id === tr.dataset.c; })[0]; };

  $('#rows').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var c = campanaDe(b); if (!c) return;
    var a = b.dataset.a;

    if (a === 'resultados') return descargar(c, b);

    var pendientes = c.sin_llamar + c.en_reintento;
    if (a === 'iniciar') {
      var d = state.info;
      var horas = Math.max(1, Math.round(pendientes / 390));
      var ok = await confirmar('¿Iniciar “' + c.nombre + '”?',
        'Se llamará a ' + num(pendientes) + ' contactos desde ' + c.numero + ' (' + c.marca + ') con el agente de ese número, entre las ' + d.hora_desde + ':00 y las ' + d.hora_hasta + ':00 (hora de Lima). ' +
        'Reintentos: ' + (d.reintentos_min || []).map(minutosTexto).join(', ') + ' desde la primera llamada. ' +
        'Como referencia, con unas 13 líneas libres tomaría unas ' + horas + ' h de llamadas. Los leads de Bitrix siguen teniendo prioridad.', 'Iniciar');
      if (!ok) return;
    }
    if (a === 'cancelar') {
      var ok2 = await confirmar('¿Cancelar “' + c.nombre + '”?',
        'Ya no se llamará a los ' + num(pendientes) + ' contactos que faltan. Las llamadas en curso terminan solas y lo ya hecho se conserva. No se puede reactivar.', 'Cancelar campaña', true);
      if (!ok2) return;
    }

    setBusy(b, true);
    try {
      var r = await Auth.api('campanas_estado', { campana_id: c.campana_id, accion: a });
      if (!r.ok) { toast(errText(r), true); setBusy(b, false); return; }
      toast({ iniciar: 'Campaña iniciada', pausar: 'Campaña en pausa', reanudar: 'Campaña reanudada', cancelar: 'Campaña cancelada' }[a]);
      await cargar();
    } catch (ex) { toast('No pudimos conectar con el servidor.', true); setBusy(b, false); }
  });

  function celdaCsv(v) {
    var t = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  }
  async function descargar(c, btn) {
    setBusy(btn, true, 'Preparando…');
    try {
      var r = await Auth.api('campanas_resultados', { campana_id: c.campana_id });
      if (!r.ok) { toast(errText(r), true); return; }
      var filas = [['Teléfono', 'Nombre', 'Programa', 'Estado', 'Intentos', 'Último resultado', 'Primera llamada', 'Actualizado']];
      r.contactos.forEach(function (x) { filas.push([x.telefono, x.nombre, x.programa, x.estado, x.intentos, x.ultimo_resultado, x.primera_llamada, x.actualizado]); });
      var texto = '﻿' + filas.map(function (f) { return f.map(celdaCsv).join(','); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = 'campana-' + r.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('Resultados descargados');
    } catch (ex) { toast('No pudimos conectar con el servidor.', true); }
    finally { setBusy(btn, false); }
  }

  /* ---------- leer el CSV ---------- */
  function separarCsv(texto) {
    texto = texto.replace(/^﻿/, '');
    var primera = texto.split(/\r?\n/)[0] || '';
    var sep = [';', ',', '\t'].map(function (s) { return { s: s, n: primera.split(s).length }; }).sort(function (a, b) { return b.n - a.n; })[0].s;
    var filas = [], fila = [], celda = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
        else celda += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(celda); celda = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(celda); filas.push(fila); fila = []; celda = '';
      } else celda += ch;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas.filter(function (f) { return f.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function decodificar(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { return new TextDecoder('windows-1252').decode(buffer); }
  }

  function nombreVariable(cabecera) {
    var t = String(cabecera).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!t) return '';
    if (/^[0-9]/.test(t)) t = 'v_' + t;
    return t.slice(0, 40);
  }

  // Igual que en el servidor: "900 000 000" con prefijo 51 -> "+51900000000"
  function telefonoValido(valor, prefijo) {
    var d = String(valor == null ? '' : valor).replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (prefijo && d.length > 0 && d.length <= 10) d = prefijo + d;
    return d.length >= 8 && d.length <= 15 ? '+' + d : '';
  }

  function adivinar(cabeceras, patron) {
    for (var i = 0; i < cabeceras.length; i++) if (patron.test(cabeceras[i].toLowerCase())) return i;
    return -1;
  }

  function llenarSelect(sel, cabeceras, elegido, opcional) {
    sel.innerHTML = (opcional ? '<option value="-1">— No usar —</option>' : '<option value="-1">Elige una columna…</option>') +
      cabeceras.map(function (h, i) { return '<option value="' + i + '"' + (i === elegido ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('');
  }

  async function leerArchivo(file) {
    $('#formErr').textContent = '';
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { $('#formErr').textContent = 'Ese es un archivo de Excel. Guárdalo como “CSV UTF-8” y súbelo de nuevo.'; return; }
    if (file.size > 8 * 1024 * 1024) { $('#formErr').textContent = 'El archivo es muy grande (máximo 8 MB).'; return; }
    var filas = separarCsv(decodificar(await file.arrayBuffer()));
    if (filas.length < 2) { $('#formErr').textContent = 'El archivo debe tener una fila de títulos y al menos un contacto.'; return; }
    if (filas.length - 1 > MAX_FILAS) { $('#formErr').textContent = 'El archivo tiene ' + num(filas.length - 1) + ' filas. El máximo por campaña es ' + num(MAX_FILAS) + '. Divídelo en dos campañas.'; return; }

    var cabeceras = filas[0].map(function (h, i) { return String(h).trim() || 'columna ' + (i + 1); });
    csv = { nombre: file.name, cabeceras: cabeceras, filas: filas.slice(1) };

    llenarSelect($('#mTel'), cabeceras, adivinar(cabeceras, /tel|cel|phone|whats|movil|móvil|numero|número/), false);
    llenarSelect($('#mNom'), cabeceras, adivinar(cabeceras, /nombre|name|cliente/), true);
    llenarSelect($('#mPro'), cabeceras, adivinar(cabeceras, /programa|carrera|curso|maestr|interes|interés/), true);

    $('#drop').hidden = true; $('#dropFile').hidden = false; $('#mapa').hidden = false;
    $('#dfName').textContent = file.name; $('#dfInfo').textContent = num(csv.filas.length) + ' filas';
    actualizarMapa();
  }

  function columnasUsadas() {
    return [Number($('#mTel').value), Number($('#mNom').value), Number($('#mPro').value)];
  }

  function pintarExtras() {
    var usadas = columnasUsadas();
    var marcadas = $$('#extras input:checked').map(function (i) { return i.value; });
    $('#extras').innerHTML = csv.cabeceras.map(function (h, i) {
      if (usadas.indexOf(i) >= 0) return '';
      var v = nombreVariable(h);
      var bloqueada = !v || RESERVADAS.indexOf(v) >= 0;
      return '<label class="fchk' + (bloqueada ? ' off' : '') + '"' + (bloqueada ? ' title="Este nombre ya lo usa el sistema"' : '') + '><input type="checkbox" value="' + i + '"' +
        (bloqueada ? ' disabled' : '') + (marcadas.indexOf(String(i)) >= 0 ? ' checked' : '') + '> ' + esc(h) + (v && v !== h ? ' <small style="color:var(--ink3)">→ ' + esc(v) + '</small>' : '') + '</label>';
    }).join('');
    $('#extrasBox').hidden = !$('#extras').innerHTML.trim();
  }

  // Convierte el CSV en la lista de contactos con el mapeo elegido
  function armarContactos() {
    var iTel = Number($('#mTel').value), iNom = Number($('#mNom').value), iPro = Number($('#mPro').value);
    var extras = $$('#extras input:checked').map(function (i) { return Number(i.value); });
    var prefijo = $('#fPrefijo').value.replace(/\D/g, '');
    var vistos = {}, validos = [], invalidos = [], repetidos = 0;

    csv.filas.forEach(function (f, k) {
      var linea = k + 2;
      var tel = iTel >= 0 ? telefonoValido(f[iTel], prefijo) : '';
      if (!tel) { invalidos.push({ n: linea, telefono: iTel >= 0 ? String(f[iTel] || '') : '' }); return; }
      if (vistos[tel]) { repetidos++; return; }
      vistos[tel] = true;
      var variables = {};
      extras.forEach(function (i) { var v = String(f[i] == null ? '' : f[i]).trim(); if (v) variables[nombreVariable(csv.cabeceras[i])] = v; });
      validos.push({ n: linea, telefono: tel, nombre: iNom >= 0 ? String(f[iNom] || '').trim() : '', programa: iPro >= 0 ? String(f[iPro] || '').trim() : '', variables: variables });
    });
    return { validos: validos, invalidos: invalidos, repetidos: repetidos };
  }

  function actualizarMapa() {
    pintarExtras();
    var r = armarContactos();
    $('#stats').innerHTML =
      '<span class="stat"><b>' + num(r.validos.length) + '</b> contactos válidos</span>' +
      (r.repetidos ? '<span class="stat"><b>' + num(r.repetidos) + '</b> repetidos (se llaman una vez)</span>' : '') +
      (r.invalidos.length ? '<span class="stat bad"><b>' + num(r.invalidos.length) + '</b> sin número válido (se omiten)</span>' : '');

    $('#pvHead').innerHTML = '<tr><th>Teléfono</th><th>Nombre</th><th>Programa</th><th>Variables</th></tr>';
    $('#pvBody').innerHTML = r.validos.slice(0, 4).map(function (c) {
      return '<tr><td>' + esc(c.telefono) + '</td><td>' + esc(c.nombre) + '</td><td>' + esc(c.programa) + '</td><td>' + esc(Object.keys(c.variables).map(function (k) { return k + '=' + c.variables[k]; }).join(', ')) + '</td></tr>';
    }).join('');
    validar(r);
  }

  function validar(r) {
    r = r || (csv ? armarContactos() : null);
    var nombre = $('#fNombre').value.trim();
    var falta = '';
    if (nombre.length < 3) falta = 'Escribe el nombre de la campaña.';
    else if (!$('#fNumero').value) falta = 'Elige el número de salida.';
    else if (!csv) falta = 'Sube el archivo CSV.';
    else if (r && r.validos.length === 0) falta = 'Elige la columna del teléfono: no hay números válidos.';
    $('#formOk').disabled = !!falta;
    $('#okHint').textContent = falta;
  }

  ['#mTel', '#mNom', '#mPro'].forEach(function (s) { $(s).addEventListener('change', actualizarMapa); });
  $('#extras').addEventListener('change', actualizarMapa);
  $('#fPrefijo').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); if (csv) actualizarMapa(); });
  $('#fNombre').addEventListener('input', function () { validar(); });
  $('#fNumero').addEventListener('change', function () { validar(); });
  $('#fArchivo').addEventListener('change', function () { leerArchivo(this.files[0]); });
  $('#dfQuitar').addEventListener('click', function () { reiniciarArchivo(); });
  ['dragenter', 'dragover'].forEach(function (ev) { $('#drop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('on'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { $('#drop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove('on'); }); });
  $('#drop').addEventListener('drop', function (e) { leerArchivo(e.dataTransfer.files[0]); });

  function reiniciarArchivo() {
    csv = null; $('#fArchivo').value = '';
    $('#drop').hidden = false; $('#dropFile').hidden = true; $('#mapa').hidden = true;
    $('#formErr').textContent = ''; validar();
  }

  /* ---------- nueva campaña ---------- */
  async function abrirNueva() {
    reiniciarArchivo();
    $('#fNombre').value = ''; $('#fPrefijo').value = '';
    $('#subida').hidden = true; $('#formFoot').hidden = false; $('#formErr').textContent = '';
    $('#fNumero').innerHTML = '<option value="">Cargando…</option>';
    $('#dlgNueva').showModal(); $('#dlgBody').scrollTop = 0; $('#fNombre').focus();
    try {
      var r = await Auth.api('config_listar');
      state.numeros = (r.numeros || []).filter(function (n) { return n.activo === 'Sí' && n.uso !== 'Entrante' && n.agente_id; });
    } catch (e) { state.numeros = []; }
    if (!state.numeros.length) {
      $('#fNumero').innerHTML = '<option value="">No hay números disponibles</option>';
      $('#fNumeroHint').textContent = 'Necesitas un número activo, que haga llamadas y tenga agente de Retell. Configúralo en Marcas y números.';
    } else {
      $('#fNumero').innerHTML = state.numeros.map(function (n) { return '<option value="' + esc(n.numero) + '">' + esc(n.marca + ' · ' + n.numero) + '</option>'; }).join('');
      $('#fNumeroHint').textContent = 'La campaña llama con el agente de Retell configurado para ese número.';
    }
    validar();
  }
  $('#newBtn').addEventListener('click', abrirNueva);

  var subiendo = false;
  $('#dlgNueva').addEventListener('cancel', function (e) { if (subiendo) e.preventDefault(); });
  function progreso(pct, texto) { $('#upBar').style.width = pct + '%'; $('#upTxt').textContent = texto; }

  $('#form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#formErr'); err.textContent = '';
    var datos = armarContactos();
    if (!datos.validos.length) { err.textContent = 'No hay contactos con número válido.'; return; }

    subiendo = true; $('#formFoot').hidden = true; $('#subida').hidden = false; progreso(2, 'Creando la campaña…');
    $('#subida').scrollIntoView({ block: 'nearest' });
    var id = null;
    try {
      var cr = await Auth.api('campanas_crear', { nombre: $('#fNombre').value, numero: $('#fNumero').value, prefijo: $('#fPrefijo').value });
      if (!cr.ok) { err.textContent = errText(cr); subiendo = false; $('#subida').hidden = true; $('#formFoot').hidden = false; return; }
      id = cr.campana_id;

      var resumen = { agregados: 0, duplicados: 0, no_llamar: 0, rechazados: [] };
      for (var i = 0; i < datos.validos.length; i += TANDA) {
        var tanda = datos.validos.slice(i, i + TANDA);
        progreso(5 + Math.round(i * 90 / datos.validos.length), 'Subiendo contactos… ' + num(i) + ' de ' + num(datos.validos.length));
        var su = await Auth.api('campanas_subir', { campana_id: id, contactos: tanda });
        if (!su.ok) throw new Error(errText(su));
        resumen.agregados += su.agregados; resumen.duplicados += su.duplicados; resumen.no_llamar += su.no_llamar;
        resumen.rechazados = resumen.rechazados.concat(su.rechazados.filter(function (x) { return x.telefono; }));
      }
      progreso(97, 'Terminando…');
      var li = await Auth.api('campanas_estado', { campana_id: id, accion: 'listo' });
      if (!li.ok) throw new Error(errText(li));
      progreso(100, 'Listo');

      subiendo = false;
      $('#dlgNueva').close();
      await cargar();
      mostrarResultado($('#fNombre').value.trim(), resumen, datos);
    } catch (ex) {
      // Si se cortó a medias, la campaña a medio subir se cancela para no dejar basura
      if (id) { try { await Auth.api('campanas_estado', { campana_id: id, accion: 'cancelar' }); } catch (e2) {} }
      err.textContent = (ex && ex.message && ex.message.length < 140 ? ex.message + ' ' : '') + 'La subida se interrumpió y la campaña se canceló. Inténtalo de nuevo.';
      subiendo = false; $('#subida').hidden = true; $('#formFoot').hidden = false; cargar(true);
    }
  });

  function mostrarResultado(nombre, r, datos) {
    $('#rsTitle').textContent = 'Campaña “' + nombre + '” creada';
    $('#rsSub').textContent = 'Está lista, pero todavía no llama. Cuando quieras, pulsa “Iniciar” en la lista.';
    var s = '<span class="stat"><b>' + num(r.agregados) + '</b> contactos cargados</span>';
    var duplicados = r.duplicados + datos.repetidos;
    if (duplicados) s += '<span class="stat"><b>' + num(duplicados) + '</b> repetidos omitidos</span>';
    if (r.no_llamar) s += '<span class="stat"><b>' + num(r.no_llamar) + '</b> en “No llamar” (no se llamarán)</span>';
    if (datos.invalidos.length) s += '<span class="stat bad"><b>' + num(datos.invalidos.length) + '</b> sin número válido</span>';
    $('#rsStats').innerHTML = s;
    var lista = $('#rsLista');
    lista.hidden = !datos.invalidos.length;
    lista.innerHTML = datos.invalidos.slice(0, 12).map(function (x) { return '<div>Fila ' + x.n + ': “' + esc(x.telefono || 'vacío') + '”</div>'; }).join('') +
      (datos.invalidos.length > 12 ? '<div>… y ' + num(datos.invalidos.length - 12) + ' más</div>' : '');
    $('#dlgResultado').showModal();
  }

  state.loaded = false; pintar(); cargar();
})();
