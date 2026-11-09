(function(){
const CFG = Object.assign({SUPABASE_URL:'', SUPABASE_ANON_KEY:''}, window.OV_CONFIG || {}), $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => 'S/ ' + Number(n||0).toFixed(2);
const fecha = d => new Date(d).toLocaleString('es-PE', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
const dia = d => new Date(d).toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'});
const ESTADOS = {pendiente:'Pendiente', confirmado:'Confirmado', en_camino:'En camino', entregado:'Entregado', cancelado:'Cancelado'};
const SIG = {pendiente:['confirmado','Confirmar pedido'], confirmado:['en_camino','Marcar en camino'], en_camino:['entregado','Marcar entregado']};
let sb = null;
try {
  let u = String(CFG.SUPABASE_URL || '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (u && CFG.SUPABASE_ANON_KEY && window.supabase) sb = window.supabase.createClient(u, String(CFG.SUPABASE_ANON_KEY).trim());
} catch (e) { console.error('No se pudo conectar con Supabase:', e); }
let pedidos = [], productos = [], clientes = [], abierto = null, abiertoC = null, yo = null;
function aviso(m){ const e = $('msg'); e.textContent = m; e.style.display = m ? 'block' : 'none'; }
const tel9 = t => String(t||'').replace(/\D/g,'').slice(-9);

if (!sb) { $('lerr').textContent = 'Falta configurar Supabase en config.js (ver LEEME).'; $('entrar').disabled = true; }
else {
  sb.auth.getSession().then(({data}) => { if (data.session) iniciar(data.session.user); });
  $('entrar').onclick = async () => {
    $('lerr').textContent = '';
    const {data, error} = await sb.auth.signInWithPassword({email:$('em').value.trim(), password:$('pw').value});
    if (error) { $('lerr').textContent = 'Correo o contraseña incorrectos.'; return; }
    iniciar(data.user);
  };
  $('pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('entrar').click(); });
  $('salir').onclick = async () => { await sb.auth.signOut(); location.reload(); };
}
async function iniciar(u){
  const {data, error} = await sb.rpc('es_admin');
  if (error || data !== true) { await sb.auth.signOut(); $('lerr').textContent = 'Esta cuenta no tiene acceso al panel.'; $('login').classList.remove('hide'); return; }
  yo = u; $('login').classList.add('hide'); $('app').classList.remove('hide'); $('salir').classList.remove('hide'); $('user').textContent = u.email; cargar();
}
async function cargar(){
  aviso('');
  const [a, b, c] = await Promise.all([
    sb.from('pedidos').select('*, clientes(nombre,telefono,direccion,email), detalle_pedido(cantidad,precio_unit,productos(presentacion)), pagos(id,monto,metodo,creado)').order('creado', {ascending:false}),
    sb.from('productos').select('*').order('orden'),
    sb.from('clientes').select('*').order('creado', {ascending:false})]);
  const er = a.error || b.error || c.error;
  if (er) { aviso('No se pudieron cargar los datos: ' + er.message + ' (¿ya ejecutaste supabase_v2.sql?)'); return; }
  pedidos = a.data; productos = b.data; clientes = c.data.filter(x => !(yo && x.user_id === yo.id)); render();
}
const pagado = p => (p.pagos||[]).reduce((s,x) => s + Number(x.monto), 0);
const nivel = p => p.stock == null ? 'na' : Number(p.stock) <= 0 ? 'out' : Number(p.stock) <= Number(p.stock_minimo) ? 'low' : 'ok';
function render(){ alertas(); stats(); lista(); listaClientes(); prods(); }

function alertas(){
  const out = productos.filter(p => p.activo && nivel(p) === 'out'), low = productos.filter(p => p.activo && nivel(p) === 'low');
  const el = $('alertas'); el.className = 'alert' + (out.length ? ' show red' : low.length ? ' show' : '');
  el.innerHTML = (out.length ? `<b>⛔ Agotado: ${out.map(p => esc(p.presentacion)).join(', ')}</b>La web ya no deja pedir estas presentaciones.` : '') +
    (low.length ? `<b>⚠ Poco stock: ${low.map(p => `${esc(p.presentacion)} (${p.stock} u.)`).join(', ')}</b>Repón pronto en "Productos y stock".` : '');
}
function stats(){
  const vivos = pedidos.filter(p => p.estado !== 'cancelado');
  const venta = vivos.reduce((s,p) => s + Number(p.total), 0), cobrado = vivos.reduce((s,p) => s + pagado(p), 0);
  const bajos = productos.filter(p => p.activo && (nivel(p)==='low' || nivel(p)==='out')).length;
  $('stats').innerHTML = [
    [pedidos.filter(p => p.estado==='pendiente').length,'Pedidos pendientes',''],
    [pedidos.filter(p => p.estado==='confirmado'||p.estado==='en_camino').length,'En proceso',''],
    [money(venta),'Ventas totales',''], [money(venta-cobrado),'Por cobrar',''],
    [clientes.filter(c => c.user_id).length,'Clientes con cuenta',''],
    [bajos,'Productos con poco stock', bajos ? 'warn' : '']
  ].map(x => `<div class="stat ${x[2]}"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
}
function lista(){
  const f = $('filtro').value, q = $('buscaP').value.trim().toLowerCase();
  const L = pedidos.filter(p => (!f || p.estado === f) && (!q || String(p.id) === q || ((p.clientes||{}).nombre||'').toLowerCase().includes(q) || String((p.clientes||{}).telefono||'').includes(q)));
  $('lista').innerHTML = L.length ? L.map(p => {
    const pg = pagado(p), est = pg >= Number(p.total) && p.total > 0 ? ['p-si','Pagado'] : pg > 0 ? ['p-par','Pago parcial'] : ['p-no','Sin pagar'];
    const c = p.clientes || {}, sig = SIG[p.estado];
    return `<div class="card ${abierto===p.id?'open':''}" data-id="${p.id}">
      <div class="row" data-toggle="${p.id}" style="cursor:pointer">
        <div><b>N° ${p.id} · ${esc(c.nombre)}</b><br><span class="muted">${fecha(p.creado)} · ${esc(c.telefono)}${p.factura?' · con factura':''}</span></div>
        <div style="text-align:right"><b>${money(p.total)}</b><br><span class="pill s-${p.estado}">${ESTADOS[p.estado]}</span> <span class="pill ${est[0]}">${est[1]}</span></div>
      </div>
      ${sig ? `<div class="quick"><button data-sig="${p.id}" data-est="${sig[0]}">${sig[1]}</button></div>` : ''}
      <div class="det">
        <table>${(p.detalle_pedido||[]).map(d => `<tr><td>${d.cantidad} × ${esc(d.productos&&d.productos.presentacion)}</td><td style="text-align:right">${money(d.cantidad*d.precio_unit)}</td></tr>`).join('')}</table>
        ${p.direccion?`<p class="muted" style="margin-top:8px">Dirección: ${esc(p.direccion)}</p>`:''}${p.notas?`<p class="muted">Notas: ${esc(p.notas)}</p>`:''}
        <p class="muted" style="margin-top:8px">Pagado: ${money(pg)} de ${money(p.total)}${(p.pagos||[]).length?' · '+p.pagos.map(x => money(x.monto)+' ('+esc(x.metodo)+')').join(', '):''}</p>
        <div class="tools">
          <div><label>Estado</label><select data-estado="${p.id}">${Object.entries(ESTADOS).map(([k,v]) => `<option value="${k}" ${k===p.estado?'selected':''}>${v}</option>`).join('')}</select></div>
          <div><label>Registrar pago (S/)</label><input type="number" min="0" step="0.5" id="m${p.id}" value="${Math.max(0,Number(p.total)-pg)}"></div>
          <div><label>Método</label><select id="mt${p.id}"><option>efectivo</option><option>Yape</option><option>Plin</option><option>transferencia</option></select></div>
          <button data-pago="${p.id}">Guardar pago</button>
          <button class="wa" data-wa="${p.id}">Avisar por WhatsApp</button>
        </div>
        ${p.estado==='cancelado'?'<p class="muted" style="margin-top:8px">Pedido cancelado: las unidades volvieron al stock.</p>':''}
      </div></div>`;
  }).join('') : '<p class="muted">No hay pedidos con ese filtro.</p>';
}
function listaClientes(){
  const f = $('filtroC').value, q = $('buscaC').value.trim().toLowerCase();
  const agg = {}; pedidos.forEach(p => { const a = agg[p.cliente_id] = agg[p.cliente_id] || {n:0, t:0, ult:null, L:[]}; a.n++; a.L.push(p); if (p.estado !== 'cancelado') a.t += Number(p.total); if (!a.ult) a.ult = p.creado; });
  const L = clientes.filter(c => (!f || (f==='cuenta' ? c.user_id : !c.user_id)) && (!q || (c.nombre||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || String(c.telefono||'').includes(q)));
  $('listaC').innerHTML = L.length ? L.map(c => { const a = agg[c.id] || {n:0,t:0,ult:null,L:[]};
    return `<div class="card ${abiertoC===c.id?'open':''}">
      <div class="row" data-tc="${c.id}" style="cursor:pointer">
        <div><b>${esc(c.nombre)}</b> <span class="pill ${c.user_id?'c-si':'c-no'}">${c.user_id?'Con cuenta':'Invitado'}</span><br>
          <span class="muted">${esc(c.telefono||'sin celular')}${c.email?' · '+esc(c.email):''} · ${c.user_id?'registrado el ':'primer pedido el '}${dia(c.creado)}</span></div>
        <div style="text-align:right"><b>${money(a.t)}</b><br><span class="muted">${a.n} pedido${a.n===1?'':'s'}${a.ult?' · último '+dia(a.ult):''}</span></div>
      </div>
      <div class="det">
        ${c.direccion?`<p class="muted" style="margin-bottom:8px">Dirección: ${esc(c.direccion)}</p>`:''}
        ${a.L.length ? `<table>${a.L.map(p => `<tr><td>N° ${p.id} · ${dia(p.creado)}</td><td><span class="pill s-${p.estado}">${ESTADOS[p.estado]}</span></td><td style="text-align:right">${money(p.total)}</td></tr>`).join('')}</table>` : '<p class="muted">Todavía no tiene pedidos.</p>'}
        ${c.telefono?`<div class="quick"><a class="btn wa" href="https://wa.me/51${tel9(c.telefono)}" target="_blank" rel="noopener">Escribir por WhatsApp</a></div>`:''}
      </div></div>`; }).join('') : '<p class="muted">No hay clientes con ese filtro.</p>';
}
function prods(){
  const K = {ok:['k-ok','Stock suficiente'], low:['k-low','Poco stock'], out:['k-out','Agotado'], na:['k-na','Sin control de stock']};
  $('v-productos').innerHTML = `<p class="muted" style="margin-bottom:12px">Escribe cuántas unidades tienes. Si lo dejas vacío, no se controla el stock. Cada pedido descuenta unidades automáticamente y avisa cuando quedan pocas.</p>` +
    productos.map(p => { const k = K[nivel(p)]; return `<div class="card"><div class="row" style="margin-bottom:6px"><b style="font-size:1.05rem">Aceite de palta · ${esc(p.presentacion)}</b><span class="pill ${k[0]}">${k[1]}</span></div><div class="grid2">
    <div><label>Presentación</label><input id="pp${p.id}" value="${esc(p.presentacion)}"></div>
    <div><label>Precio (S/)</label><input id="pr${p.id}" type="number" step="0.5" min="0" value="${p.precio}"></div>
    <div><label>Unidades en stock</label><input id="ps${p.id}" type="number" min="0" step="1" placeholder="Sin control" value="${p.stock==null?'':p.stock}"></div>
    <div><label>Avisar cuando queden</label><input id="pm${p.id}" type="number" min="0" step="1" value="${p.stock_minimo}"></div>
    <div><label>Visible en la web</label><select id="pa${p.id}"><option value="1" ${p.activo?'selected':''}>Sí</option><option value="0" ${!p.activo?'selected':''}>No</option></select></div>
    <button data-guardar="${p.id}">Guardar</button></div></div>`; }).join('') +
    `<div class="card"><b>Agregar presentación</b><div class="grid2"><div><label>Presentación</label><input id="npP" placeholder="Ej. 750 ml"></div><div><label>Precio (S/)</label><input id="npR" type="number" step="0.5" min="0"></div><div><label>Unidades</label><input id="npS" type="number" min="0" step="1" placeholder="Sin control"></div><button class="gold" id="npB">Agregar</button></div></div>`;
}
const numOrNull = v => { v = String(v).trim(); return v === '' ? null : Math.max(0, Math.floor(Number(v))); };
document.addEventListener('click', async e => {
  const t = e.target;
  if (t.closest('[data-toggle]') && !t.closest('button')) { const id = Number(t.closest('[data-toggle]').dataset.toggle); abierto = abierto === id ? null : id; lista(); return; }
  if (t.closest('[data-tc]')) { const id = Number(t.closest('[data-tc]').dataset.tc); abiertoC = abiertoC === id ? null : id; listaClientes(); return; }
  if (t.dataset.t) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b === t)); ['pedidos','clientes','productos'].forEach(v => $('v-'+v).classList.toggle('hide', v !== t.dataset.t)); return; }
  if (t.dataset.sig) { const {error} = await sb.from('pedidos').update({estado:t.dataset.est}).eq('id', t.dataset.sig); if (error) return aviso(error.message); return cargar(); }
  if (t.dataset.pago) { const id = t.dataset.pago, monto = Number($('m'+id).value); if (!(monto > 0)) return aviso('Escribe un monto mayor a 0.');
    const {error} = await sb.from('pagos').insert({pedido_id:id, monto, metodo:$('mt'+id).value}); if (error) return aviso(error.message); abierto = Number(id); return cargar(); }
  if (t.dataset.wa) { const p = pedidos.find(x => x.id == t.dataset.wa), c = p.clientes || {};
    const txt = `Hola ${c.nombre}, te escribe Oro Verde. Tu pedido N° ${p.id} por ${money(p.total)} está ${ESTADOS[p.estado].toLowerCase()}. ¡Gracias por tu compra!`;
    window.open('https://wa.me/51' + tel9(c.telefono) + '?text=' + encodeURIComponent(txt), '_blank'); return; }
  if (t.dataset.guardar) { const id = t.dataset.guardar;
    const {error} = await sb.from('productos').update({presentacion:$('pp'+id).value.trim(), precio:Number($('pr'+id).value), stock:numOrNull($('ps'+id).value), stock_minimo:numOrNull($('pm'+id).value) ?? 5, activo:$('pa'+id).value==='1'}).eq('id', id);
    if (error) return aviso(error.message); aviso('Producto guardado.'); return cargar(); }
  if (t.id === 'npB') { const pr = $('npP').value.trim(), v = Number($('npR').value); if (!pr || !(v >= 0)) return aviso('Completa presentación y precio.');
    const {error} = await sb.from('productos').insert({presentacion:pr, precio:v, stock:numOrNull($('npS').value), orden:productos.length+1}); if (error) return aviso(error.message); return cargar(); }
  if (t.id === 'recargar') return cargar();
});
document.addEventListener('input', e => { if (e.target.id === 'buscaP') lista(); if (e.target.id === 'buscaC') listaClientes(); });
document.addEventListener('change', async e => {
  if (e.target.id === 'filtro') return lista();
  if (e.target.id === 'filtroC') return listaClientes();
  if (e.target.dataset.estado) { const nuevo = e.target.value;
    if (nuevo === 'cancelado' && !confirm('¿Cancelar este pedido? Las unidades volverán al stock.')) return lista();
    const {error} = await sb.from('pedidos').update({estado:nuevo}).eq('id', e.target.dataset.estado); if (error) return aviso(error.message); abierto = Number(e.target.dataset.estado); cargar(); }
});
})();
