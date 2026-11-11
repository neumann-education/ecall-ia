/* Sesión compartida por todas las páginas del panel.
   La sesión se guarda en el navegador con la misma clave que usa index.html, así que si entras en una página
   ya estás dentro en las demás. Quien decide si una sesión vale es siempre el servidor (Apps Script). */
(function () {
  var KEY = 'llamadas_sesion';
  var THEME_KEY = 'llamadas_tema';
  var API = (window.APP && window.APP.API_URL) || '';

  /* ---- tema (se aplica antes de pintar para que no parpadee) ---- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  document.documentElement.setAttribute('data-theme', saved || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }

  /* ---- sesión ---- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.token ? s : null;
    } catch (e) { return null; }
  }
  function save(r, remember) {
    // Si se mantiene la sesión, el servidor decide cuándo vence (se renueva con cada uso)
    var data = JSON.stringify({ token: r.token, usuario: r.usuario, expira: remember ? Date.now() + 30 * 864e5 : r.expira });
    (remember ? localStorage : sessionStorage).setItem(KEY, data);
    (remember ? sessionStorage : localStorage).removeItem(KEY);
  }
  function clear() {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function currentPage() {
    var p = location.pathname.split('/').pop();
    return /^[\w.-]+\.html$/.test(p) ? p : 'index.html';
  }
  function toLogin(msg) {
    var q = '?next=' + encodeURIComponent(currentPage()) + (msg ? '&m=' + msg : '');
    location.replace('login.html' + q);
  }
  function logout() { clear(); location.replace('login.html'); }

  async function api(action, payload) {
    var s = read();
    var res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, token: s && s.token }, payload || {}))
    });
    var data = await res.json();
    if (data && data.error === 'sesion_expirada' && action !== 'login') { clear(); toLogin('vencio'); }
    return data;
  }

  /* ---- puerta de entrada de cada página ---- */
  function gateMsg(html) {
    var g = document.getElementById('gate');
    if (g) g.innerHTML = '<div class="gate-card">' + html + '</div>';
  }
  function never() { return new Promise(function () {}); }

  async function guard(opts) {
    opts = opts || {};
    if (!read()) { toLogin(); return never(); }
    var r;
    try { r = await api('sesion'); }
    catch (e) {
      gateMsg('<h2>No pudimos conectar con el servidor</h2><p>Revisa tu conexión e inténtalo otra vez.</p><button class="btn primary" onclick="location.reload()">Reintentar</button>');
      return never();
    }
    if (!r || !r.ok) { clear(); toLogin(r && r.error === 'sesion_expirada' ? 'vencio' : ''); return never(); }
    if (opts.admin && r.usuario.rol !== 'admin') {
      gateMsg('<h2>No tienes permiso para esta página</h2><p>Solo los administradores pueden entrar aquí.</p><a class="btn primary" href="index.html">Volver al panel</a>');
      return never();
    }
    // Guarda el rol actualizado (por si un administrador lo cambió)
    var s = read();
    if (s) { s.usuario = r.usuario; var inLocal = !!localStorage.getItem(KEY); (inLocal ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s)); }
    var g = document.getElementById('gate'); if (g) g.hidden = true;
    var a = document.getElementById('app'); if (a) a.hidden = false;
    return r.usuario;
  }

  // Si cierras sesión en otra pestaña, esta también se cierra
  window.addEventListener('storage', function (e) { if (e.key === KEY && !e.newValue && !read()) toLogin(); });
  // Al volver con el botón "atrás" tras cerrar sesión, no se muestra contenido en caché
  window.addEventListener('pageshow', function (e) { if (e.persisted && document.getElementById('app') && !read()) toLogin(); });

  window.Auth = { read: read, save: save, clear: clear, api: api, guard: guard, logout: logout, toggleTheme: toggleTheme };
})();
