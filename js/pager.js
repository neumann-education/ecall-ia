(function () {
  var css = '' +
    '.pager{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line2,#EFF2F7);font-size:13px;color:var(--ink2,#59637A)}' +
    '.pager.hidden{display:none}' +
    '.pager .pg-info b{color:var(--ink,#1B2236);font-weight:600}' +
    '.pager .pg-ctl{display:flex;align-items:center;gap:4px;flex-wrap:wrap}' +
    '.pager button{font:inherit;min-width:34px;height:34px;padding:0 10px;border:1px solid var(--line,#E4E8F0);background:var(--sheet,#fff);color:var(--ink,#1B2236);border-radius:8px;cursor:pointer}' +
    '.pager button:hover:not(:disabled){background:var(--hover,#F6F8FC)}' +
    '.pager button:disabled{opacity:.45;cursor:default}' +
    '.pager button[aria-current="page"]{background:var(--accent,#5048E5);border-color:var(--accent,#5048E5);color:var(--accent-ink,#fff);font-weight:600}' +
    '.pager .pg-gap{padding:0 4px;color:var(--ink3,#8C95A8)}' +
    '.pager .pg-size{display:flex;align-items:center;gap:6px}' +
    '.pager select{font:inherit;height:34px;border:1px solid var(--line,#E4E8F0);border-radius:8px;background:var(--sheet,#fff);color:var(--ink,#1B2236);padding:0 8px}' +
    '.pager .pg-mob{display:none;padding:0 6px;white-space:nowrap}' +
    '@media(max-width:640px){.pager{justify-content:center;padding:12px}.pager .pg-info{width:100%;text-align:center}.pager .pg-num,.pager .pg-gap{display:none}.pager .pg-mob{display:inline}.pager .pg-ctl{justify-content:center}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function make(el, opts) {
    opts = opts || {};
    var sizes = opts.sizes || [10, 25, 50, 100];
    var s = { page: 1, size: opts.size || 25, key: null, total: 0, refresh: null };
    el.classList.add('pager', 'hidden');

    function pages() { return Math.max(1, Math.ceil(s.total / s.size)); }

    function nums(p, n) {
      var out = [], i;
      if (n <= 7) { for (i = 1; i <= n; i++) out.push(i); return out; }
      out.push(1);
      var a = Math.max(2, p - 1), b = Math.min(n - 1, p + 1);
      if (p <= 3) { a = 2; b = 4; }
      if (p >= n - 2) { a = n - 3; b = n - 1; }
      if (a > 2) out.push('…');
      for (i = a; i <= b; i++) out.push(i);
      if (b < n - 1) out.push('…');
      out.push(n);
      return out;
    }

    function draw() {
      var n = pages();
      if (s.total <= Math.min.apply(null, sizes) || (n === 1 && s.size === (opts.size || 25))) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      var d = (s.page - 1) * s.size + 1, h = Math.min(s.total, s.page * s.size);
      var html = '<div class="pg-info">Mostrando <b>' + d + '–' + h + '</b> de <b>' + s.total + '</b></div><div class="pg-ctl">';
      html += '<button type="button" data-p="' + (s.page - 1) + '"' + (s.page <= 1 ? ' disabled' : '') + ' aria-label="Página anterior">‹ Anterior</button>';
      nums(s.page, n).forEach(function (x) {
        if (x === '…') html += '<span class="pg-gap">…</span>';
        else html += '<button type="button" class="pg-num" data-p="' + x + '"' + (x === s.page ? ' aria-current="page"' : '') + ' aria-label="Página ' + x + '">' + x + '</button>';
      });
      html += '<span class="pg-mob">Página ' + s.page + ' de ' + n + '</span>';
      html += '<button type="button" data-p="' + (s.page + 1) + '"' + (s.page >= n ? ' disabled' : '') + ' aria-label="Página siguiente">Siguiente ›</button></div>';
      html += '<label class="pg-size">Filas<select aria-label="Filas por página">' + sizes.map(function (z) { return '<option value="' + z + '"' + (z === s.size ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select></label>';
      el.innerHTML = html;
    }

    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-p]');
      if (!b || b.disabled) return;
      s.page = Math.min(pages(), Math.max(1, Number(b.dataset.p)));
      if (s.refresh) s.refresh();
      var top = el.previousElementSibling || el;
      if (top.getBoundingClientRect && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
    });
    el.addEventListener('change', function (e) {
      if (!e.target.matches('select')) return;
      s.size = Number(e.target.value); s.page = 1;
      if (s.refresh) s.refresh();
    });

    return {
      state: s,
      onChange: function (fn) { s.refresh = fn; },
      reset: function () { s.page = 1; },
      slice: function (arr, key) {
        if (key !== undefined && key !== s.key) { s.key = key; s.page = 1; }
        s.total = arr.length;
        if (s.page > pages()) s.page = pages();
        draw();
        return arr.slice((s.page - 1) * s.size, s.page * s.size);
      },
      hide: function () { s.total = 0; el.classList.add('hidden'); el.innerHTML = ''; }
    };
  }
  window.Pager = { make: make };
})();
