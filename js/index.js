(function(){
const { esc, money, tope, calcularPedido, validarPedido, armarMensaje, urlWhatsApp } = window.OVLogic;
const CFG = Object.assign({WHATSAPP:'51994581847', RECARGO_FACTURA:5, SUPABASE_URL:'', SUPABASE_ANON_KEY:''}, window.OV_CONFIG || {}), REC = Number(CFG.RECARGO_FACTURA)||0;
if (!window.OV_CONFIG) console.error('config.js no se cargó o tiene un error de sintaxis (revisa comillas y comas).');
const FALLBACK = [
  {id:1,nombre:'Aceite de palta',presentacion:'250 ml',precio:30,imagen:'assets/botella.jpg'},
  {id:2,nombre:'Aceite de palta',presentacion:'500 ml',precio:60,imagen:'assets/botella.jpg'},
  {id:3,nombre:'Aceite de palta',presentacion:'1 litro',precio:120,imagen:'assets/botella.jpg'}];
let productos = FALLBACK, cart = {};
let sb = null;
try {
  let u = String(CFG.SUPABASE_URL || '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (u && CFG.SUPABASE_ANON_KEY && window.supabase) sb = window.supabase.createClient(u, String(CFG.SUPABASE_ANON_KEY).trim());
} catch (e) { console.error('No se pudo conectar con Supabase:', e); }
const $ = id => document.getElementById(id);
document.querySelectorAll('.rec').forEach(e => e.textContent = REC); $('recargoTxt').textContent = REC; $('yy').textContent = new Date().getFullYear();

const totals = () => calcularPedido(productos, cart, $('factura').checked, REC);
const agotado = p => p.stock != null && Number(p.stock) <= 0;
function stockTxt(p){
  if (p.stock == null) return '';
  if (Number(p.stock) <= 0) return '<div class="stk out">Agotado</div>';
  if (Number(p.stock) <= Number(p.stock_minimo||5)) return `<div class="stk low">¡Quedan pocas unidades! (${p.stock})</div>`;
  return '';
}
function renderProductos(){
  $('productos').innerHTML = productos.map(p => `
    <article class="card ${agotado(p)?'agotado':''}">
      <div class="ph"><img src="${esc(p.imagen||'assets/botella.jpg')}" alt="${esc(p.nombre)} ${esc(p.presentacion)}" loading="lazy"><span class="size">${esc(p.presentacion)}</span></div>
      <div class="bd">
        <h3>${esc(p.nombre)}</h3><div class="sub">Extra virgen · 100% natural</div>
        <div class="price">${money(p.precio)} <small>por unidad</small></div>
        ${stockTxt(p)}
        <div class="qty">
          <button type="button" data-a="minus" data-id="${p.id}" aria-label="Quitar uno">−</button>
          <output id="q${p.id}">${cart[p.id]||0}</output>
          <button type="button" class="plus" data-a="plus" data-id="${p.id}" aria-label="Agregar uno" ${agotado(p)?'disabled':''}>+</button>
        </div>
      </div>
    </article>`).join('');
}
function renderResumen(){
  const t = totals();
  $('resumen').innerHTML = t.lines.length ? t.lines.map(l => `<div class="line"><div><b>${l.q} × ${esc(l.p.presentacion)}</b><br><span class="m">${money(l.pu)} c/u</span></div><b>${money(l.q*l.pu)}</b></div>`).join('') : '<p class="empty">Aún no elegiste ninguna presentación. Agrégalas en el catálogo.</p>';
  $('total').textContent = money(t.total); $('barTot').textContent = money(t.total);
  $('bar').classList.toggle('show', t.unidades > 0);
}
$('productos').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'); if(!b) return;
  const id = b.dataset.id, cur = cart[id]||0, pr = productos.find(x => String(x.id) === String(id));
  const max = tope(pr);
  if (b.dataset.a === 'plus' && cur >= max) { $('err').textContent = pr && pr.stock != null ? `Solo quedan ${pr.stock} unidades de ${pr.presentacion}.` : ''; return; }
  $('err').textContent = '';
  cart[id] = Math.max(0, Math.min(max, cur + (b.dataset.a === 'plus' ? 1 : -1)));
  $('q'+id).textContent = cart[id]; renderResumen();
});
$('factura').addEventListener('change', renderResumen);

$('form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const t = totals(), f = {nombre:$('nombre').value.trim(), tel:$('tel').value.trim(), dir:$('dir').value.trim(), notas:$('notas').value.trim()};
  const err = m => { $('err').textContent = m; return false; };
  const falla = validarPedido(t, f); if (falla) return err(falla);
  $('err').textContent = ''; const btn = $('enviar'); btn.disabled = true;
  let id = null, total = t.total;
  if (sb) {
    try {
      const {data, error} = await sb.rpc('crear_pedido', {p_nombre:f.nombre, p_telefono:f.tel, p_direccion:f.dir, p_notas:f.notas, p_factura:t.fact, p_items:t.lines.map(l => ({producto_id:l.p.id, cantidad:l.q}))});
      if (error) throw error; id = data.id; total = Number(data.total);
    } catch(e) {
      if (e && /stock/i.test(e.message || '')) {
        $('err').textContent = e.message.replace(/^.*?Stock/i, 'Stock'); btn.disabled = false;
        const r = await sb.from('productos').select('*').eq('activo', true).order('orden');
        if (r.data && r.data.length) { productos = r.data.map(p => ({...p, precio:Number(p.precio), imagen:p.imagen||'assets/botella.jpg'})); renderProductos(); renderResumen(); }
        return;
      }
      console.warn('No se pudo registrar en la base de datos:', e);
    }
  }
  if (user && id) cargarHistorial();
  const url = urlWhatsApp(CFG.WHATSAPP, armarMensaje(t, id, total, f, REC));
  const ok = $('ok'); ok.style.display = 'block';
  ok.innerHTML = (id ? `<b>¡Pedido N° ${id} registrado!</b><br>` : '<b>¡Pedido listo!</b><br>') + `Se abrirá WhatsApp para enviarlo. Si no se abre, <a href="${url}" target="_blank" rel="noopener">toca aquí</a>.`;
  setTimeout(() => { window.location.href = url; btn.disabled = false; }, 700);
});

renderProductos(); renderResumen();
// ===== CUENTA DE CLIENTE =====
let user = null, perfil = null, modo = 'in';
const ESTADOS = {pendiente:'Pendiente', confirmado:'Confirmado', en_camino:'En camino', entregado:'Entregado', cancelado:'Cancelado'};
const fecha = d => new Date(d).toLocaleDateString('es-PE', {day:'2-digit', month:'long', year:'numeric'});
const dlg = $('dlg');
function setModo(m){
  modo = m; $('tabIn').classList.toggle('on', m==='in'); $('tabUp').classList.toggle('on', m==='up');
  $('upFields').classList.toggle('hide', m==='in'); $('aGo').textContent = m==='in' ? 'Ingresar' : 'Crear mi cuenta';
  $('passHint').textContent = m==='up' ? '(mínimo 6 caracteres)' : ''; $('aPass').autocomplete = m==='in' ? 'current-password' : 'new-password'; $('aErr').textContent = '';
}
function abrirDlg(m){ setModo(m||'in'); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open',''); }
function cerrarDlg(){ if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
$('btnHero').onclick = () => user ? document.getElementById('cuenta').scrollIntoView() : abrirDlg('up');
if (!sb) { $('btnCuenta').onclick = $('btnHero').onclick = () => { abrirDlg('in'); $('aErr').textContent = 'Las cuentas aún no están activadas: falta conectar la base de datos (config.js).'; }; $('dlgX').onclick = cerrarDlg; $('tabIn').onclick = () => setModo('in'); $('tabUp').onclick = () => setModo('up'); }
if (sb) {
  $('btnCuenta').onclick = () => user ? document.getElementById('cuenta').scrollIntoView() : abrirDlg('in');
  $('tabIn').onclick = () => setModo('in'); $('tabUp').onclick = () => setModo('up'); $('dlgX').onclick = cerrarDlg;
  $('fAuth').addEventListener('submit', async e => {
    e.preventDefault(); const err = m => { $('aErr').textContent = m; };
    const mail = $('aMail').value.trim(), pass = $('aPass').value;
    if (!/^\S+@\S+\.\S+$/.test(mail)) return err('Escribe un correo válido.');
    if (pass.length < 6) return err('La contraseña debe tener al menos 6 caracteres.');
    $('aGo').disabled = true; err('');
    try {
      if (modo === 'in') {
        const {error} = await sb.auth.signInWithPassword({email:mail, password:pass});
        if (error) return err(/confirm/i.test(error.message) ? 'Confirma tu correo antes de ingresar.' : 'Correo o contraseña incorrectos.');
        cerrarDlg();
      } else {
        const nombre = $('aNombre').value.trim(), tel = $('aTel').value.trim();
        if (nombre.length < 2) return err('Escribe tu nombre.');
        if (tel.replace(/\D/g,'').length < 7) return err('Escribe un celular válido.');
        const {data, error} = await sb.auth.signUp({email:mail, password:pass, options:{data:{nombre, telefono:tel}}});
        if (error) return err(/registered|already/i.test(error.message) ? 'Ese correo ya tiene cuenta. Toca "Ingresar".' : 'No se pudo crear la cuenta: ' + error.message);
        if (data.session) cerrarDlg(); else { $('aErr').style.color = '#1c4a14'; err('Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.'); }
      }
    } finally { $('aGo').disabled = false; }
  });
  $('btnSalir').onclick = async () => { await sb.auth.signOut(); };
  sb.auth.getSession().then(({data}) => setUser(data.session ? data.session.user : null));
  sb.auth.onAuthStateChange((_ev, session) => setTimeout(() => setUser(session ? session.user : null), 0));
}
async function setUser(u){
  if (user && u && user.id === u.id) return;
  user = u; perfil = null;
  const on = !!u;
  $('btnCuenta').textContent = on ? 'Mi cuenta' : 'Ingresar'; $('btnHero').classList.toggle('hide', on);
  $('lnkCuenta').classList.toggle('hide', !on); $('cuenta').classList.toggle('hide', !on);
  if (!on) { $('hist').innerHTML = ''; $('lnkPanel').classList.add('hide'); return; }
  $('mail').textContent = 'Sesión iniciada: ' + u.email;
  sb.rpc('es_admin').then(({data}) => { if (user && user.id === u.id) $('lnkPanel').classList.toggle('hide', data !== true); });
  await cargarPerfil(); await cargarHistorial();
}
async function cargarPerfil(){
  const {data} = await sb.from('clientes').select('*').eq('user_id', user.id).maybeSingle();
  perfil = data || null;
  const m = user.user_metadata || {};
  const nom = (perfil && perfil.nombre) || m.nombre || '', tel = (perfil && perfil.telefono) || m.telefono || '', dir = (perfil && perfil.direccion) || '';
  $('dNombre').value = nom; $('dTel').value = tel; $('dDir').value = dir;
  if (!$('nombre').value) $('nombre').value = nom; if (!$('tel').value) $('tel').value = tel; if (!$('dir').value) $('dir').value = dir;
  if (nom) $('cuentaSub').textContent = 'Hola, ' + nom.split(' ')[0] + '. Aquí está tu historial de compras en Oro Verde.';
}
$('datos').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('dMsg'); msg.style.color = '#b42318';
  const nombre = $('dNombre').value.trim(), tel = $('dTel').value.trim(), dir = $('dDir').value.trim();
  if (nombre.length < 2 || tel.replace(/\D/g,'').length < 7) { msg.textContent = 'Completa tu nombre y un celular válido.'; return; }
  const {error} = await sb.from('clientes').update({nombre, telefono:tel, direccion:dir || null}).eq('user_id', user.id);
  if (error) { msg.textContent = 'No se pudo guardar.'; return; }
  msg.style.color = '#1c4a14'; msg.textContent = 'Datos guardados.';
  $('nombre').value = nombre; $('tel').value = tel; $('dir').value = dir;
});
let hist = [];
async function cargarHistorial(){
  const {data, error} = await sb.from('pedidos').select('id,creado,total,estado,factura,detalle_pedido(producto_id,cantidad,precio_unit,productos(presentacion)),pagos(monto)').order('creado', {ascending:false});
  if (error) { $('hist').innerHTML = '<p class="empty">No se pudo cargar tu historial.</p>'; return; }
  hist = data || [];
  $('hist').innerHTML = hist.length ? hist.map(p => {
    const pg = (p.pagos||[]).reduce((s,x) => s + Number(x.monto), 0), tot = Number(p.total);
    const pago = pg >= tot && tot > 0 ? ['p-si','Pagado'] : pg > 0 ? ['p-par','Pago parcial'] : ['p-no','Pago pendiente'];
    return `<div class="ped"><div class="top"><div><b style="font-family:Fraunces,serif;font-size:1.25rem;color:var(--g1)">Pedido N° ${p.id}</b><br><span style="color:var(--mut);font-size:.88rem">${fecha(p.creado)}${p.factura?' · con factura':''}</span></div>
      <div style="text-align:right"><span class="pill s-${p.estado}">${ESTADOS[p.estado]||esc(p.estado)}</span> <span class="pill ${pago[0]}">${pago[1]}</span></div></div>
      <ul>${(p.detalle_pedido||[]).map(d => `<li><span>${d.cantidad} × ${esc(d.productos ? d.productos.presentacion : '')}</span><span>${money(d.cantidad*d.precio_unit)}</span></li>`).join('')}</ul>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:1.1rem">Total ${money(tot)}</b><button class="btn sm" type="button" data-rep="${p.id}">Repetir este pedido</button></div></div>`;
  }).join('') : '<p class="empty">Aún no tienes pedidos. ¡Haz el primero desde el catálogo!</p>';
}
$('hist').addEventListener('click', e => {
  const b = e.target.closest('[data-rep]'); if (!b) return;
  const p = hist.find(x => x.id == b.dataset.rep); if (!p) return;
  cart = {}; $('factura').checked = !!p.factura;
  (p.detalle_pedido||[]).forEach(d => { if (productos.some(x => x.id === d.producto_id)) cart[d.producto_id] = d.cantidad; });
  renderProductos(); renderResumen(); document.getElementById('pedido').scrollIntoView();
});

renderProductos(); renderResumen();
if (sb) sb.from('productos').select('*').eq('activo', true).order('orden').then(({data, error}) => {
  if (!error && data && data.length) { productos = data.map(p => ({...p, precio:Number(p.precio), imagen:p.imagen||'assets/botella.jpg'})); cart = {}; renderProductos(); renderResumen(); }
});
})();
