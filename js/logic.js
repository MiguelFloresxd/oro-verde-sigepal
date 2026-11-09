/* Lógica pura de SIGEPAL (sin DOM ni red) para poder probarla con pruebas unitarias. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OVLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_POR_ITEM = 99;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = n => 'S/ ' + Number(n || 0).toFixed(2);

  /** Máximo que se puede pedir de un producto (stock o 99). */
  function tope(p) {
    if (!p || p.stock == null) return MAX_POR_ITEM;
    return Math.max(0, Math.min(MAX_POR_ITEM, Number(p.stock)));
  }

  /** Calcula líneas, unidades y total. Con factura se suma `recargo` por unidad. */
  function calcularPedido(productos, cart, factura, recargo) {
    const rec = Number(recargo) || 0;
    let unidades = 0, total = 0;
    const lines = productos.filter(p => cart[p.id] > 0).map(p => {
      const q = cart[p.id], pu = Number(p.precio) + (factura ? rec : 0);
      unidades += q; total += q * pu;
      return { p, q, pu };
    });
    return { lines, unidades, total: Math.round(total * 100) / 100, fact: !!factura };
  }

  /** Devuelve '' si todo está bien o el mensaje de error para el cliente. */
  function validarPedido(t, f) {
    if (!t.lines.length) return 'Elige al menos una presentación en el catálogo.';
    const nombre = String(f.nombre || '').trim();
    if (nombre.length < 2) return 'Escribe tu nombre.';
    if (nombre.length > 80) return 'El nombre es demasiado largo.';
    const tel = String(f.tel || '').trim();
    if (!/^[0-9+\-()\s]+$/.test(tel)) return 'El celular solo puede tener números.';
    const dig = tel.replace(/\D/g, '').length;
    if (dig < 7 || dig > 15) return 'Escribe un celular válido.';
    if (String(f.dir || '').length > 200) return 'La dirección es demasiado larga.';
    if (String(f.notas || '').length > 500) return 'Las notas son demasiado largas.';
    return '';
  }

  /** Texto del pedido que se envía por WhatsApp. */
  function armarMensaje(t, id, total, f, recargo) {
    const L = ['Hola Oro Verde, quiero hacer un pedido' + (id ? ' (N° ' + id + ')' : '') + ':'];
    t.lines.forEach(l => L.push(`• ${l.q} × Aceite de palta ${l.p.presentacion} — ${money(l.q * l.pu)}`));
    L.push('', 'Total: ' + money(total) + (t.fact ? ` (con factura, +S/ ${recargo} por unidad)` : ''));
    L.push('Nombre: ' + f.nombre, 'Celular: ' + f.tel);
    if (f.dir) L.push('Dirección: ' + f.dir);
    if (f.notas) L.push('Notas: ' + f.notas);
    return L.join('\n');
  }

  const urlWhatsApp = (numero, texto) => 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);

  return { MAX_POR_ITEM, esc, money, tope, calcularPedido, validarPedido, armarMensaje, urlWhatsApp };
});
