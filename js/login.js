(function () {
  var $ = function (s) { return document.querySelector(s); };
  var params = new URLSearchParams(location.search);
  var next = params.get('next');
  if (!/^[\w.-]+\.html$/.test(next || '') || next === 'login.html') next = 'index.html';

  var MSG = {
    credenciales: 'Usuario o contraseña incorrectos.',
    bloqueado: 'Demasiados intentos. Espera 10 minutos e inténtalo otra vez.',
    desactivado: 'Tu usuario está desactivado. Habla con un administrador.',
    faltan_datos: 'Escribe tu usuario y contraseña.',
    red: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo otra vez.'
  };
  function showError(m) { $('#err').textContent = m || ''; }
  if (params.get('m') === 'vencio') showError('Tu sesión venció. Vuelve a entrar para continuar.');

  // Si ya hay una sesión abierta en este navegador, no pide la contraseña otra vez
  (async function () {
    if (!Auth.read() || params.get('m')) { $('#form').hidden = false; return; }
    try {
      var r = await Auth.api('sesion');
      if (r && r.ok) { location.replace(next); return; }
    } catch (e) { /* sin conexión: se muestra el formulario */ }
    Auth.clear();
    $('#form').hidden = false;
  })();

  $('#showPw').addEventListener('click', function () {
    var p = $('#p'), v = p.type === 'password';
    p.type = v ? 'text' : 'password';
    this.textContent = v ? 'Ocultar' : 'Mostrar';
  });

  $('#form').addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');
    var u = $('#u').value.trim(), p = $('#p').value;
    if (!u || !p) { showError(MSG.faltan_datos); return; }
    var btn = $('#go'); btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      var r = await Auth.api('login', { usuario: u, password: p });
      if (r && r.ok) {
        Auth.save(r, $('#remember').checked);
        location.replace(next);
        return;
      }
      showError(MSG[r && r.error] || 'No pudimos iniciar sesión. Inténtalo otra vez.');
    } catch (err) {
      showError(MSG.red);
    }
    btn.disabled = false; btn.textContent = 'Entrar';
  });
})();
