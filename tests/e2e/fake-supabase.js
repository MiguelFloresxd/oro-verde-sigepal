/* Supabase falso para pruebas E2E (no usa red). Se inyecta en lugar del script del CDN. */
(function () {
  const now = new Date().toISOString();
  const D = {
    productos: [
      { id: 1, nombre: 'Aceite de palta', presentacion: '250 ml', precio: 30, activo: true, orden: 1, stock: 3, stock_minimo: 5 },
      { id: 2, nombre: 'Aceite de palta', presentacion: '500 ml', precio: 60, activo: true, orden: 2, stock: 20, stock_minimo: 5 },
      { id: 3, nombre: 'Aceite de palta', presentacion: '1 litro', precio: 120, activo: true, orden: 3, stock: 0, stock_minimo: 5 },
    ],
    pedidos: [{ id: 12, cliente_id: 1, creado: now, direccion: 'Calle Lima 123', notas: '', factura: false, total: 60, estado: 'pendiente',
      clientes: { nombre: 'María Pérez', telefono: '999111222' },
      detalle_pedido: [{ producto_id: 2, cantidad: 1, precio_unit: 60, productos: { presentacion: '500 ml' } }], pagos: [] }],
    clientes: [{ id: 1, nombre: 'María Pérez', telefono: '999111222', email: 'maria@mail.com', user_id: 'u1', creado: now }],
  };
  const sess = window.__LOGGED ? { user: { id: 'u1', email: 'admin@mail.com', user_metadata: {} } } : null;
  window.__RPC = [];
  function qb(t) {
    const b = { select() { return b; }, eq() { return b; }, order() { return b; }, update() { return b; }, insert() { return b; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: D[t] || [], error: null }).then(res, rej); } };
    return b;
  }
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: sess } }), onAuthStateChange: () => ({ data: {} }), signOut: async () => {},
      signInWithPassword: async () => ({ error: null, data: {} }), signUp: async () => ({ data: { session: null }, error: null }) },
    from: qb,
    rpc: async (n, args) => { window.__RPC.push({ n, args }); return n === 'es_admin' ? { data: true, error: null } : { data: { id: 99, total: 60 }, error: null }; },
  }) };
})();
