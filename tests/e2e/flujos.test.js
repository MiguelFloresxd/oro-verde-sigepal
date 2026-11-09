/* Pruebas de extremo a extremo con Playwright (Chromium). Sirven el sitio en local y simulan Supabase. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
let server, base, browser;

test.before(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  base = 'http://localhost:' + server.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });

async function abrir(ruta, { logged = false, viewport = { width: 1200, height: 900 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.includes('supabase')) return r.fulfill({ body: FAKE, contentType: 'text/javascript' });
    if (u.startsWith('https://wa.me')) return r.fulfill({ body: 'wa', contentType: 'text/html' });
    return r.abort();
  });
  await page.addInitScript('window.__LOGGED=' + logged);
  await page.goto(base + ruta);
  await page.waitForTimeout(400);
  return { page, errores };
}

test('catálogo muestra 3 presentaciones con precios reales y sin errores JS', async () => {
  const { page, errores } = await abrir('/');
  assert.equal(await page.locator('#productos .card').count(), 3);
  const txt = await page.locator('#productos').innerText();
  for (const p of ['S/ 30.00', 'S/ 60.00', 'S/ 120.00']) assert.match(txt, new RegExp(p.replace('/', '\\/')));
  assert.deepEqual(errores, []);
  await page.close();
});

test('agregar al carrito actualiza el total y la factura suma el recargo', async () => {
  const { page } = await abrir('/');
  await page.click('button[data-a=plus][data-id="2"]');
  await page.click('button[data-a=plus][data-id="2"]');
  assert.equal(await page.innerText('#total'), 'S/ 120.00');
  await page.check('#factura');
  assert.equal(await page.innerText('#total'), 'S/ 130.00');
  await page.close();
});

test('esquina: no deja pedir más que el stock y bloquea lo agotado', async () => {
  const { page } = await abrir('/');
  for (let i = 0; i < 6; i++) await page.click('button[data-a=plus][data-id="1"]');
  assert.equal(await page.innerText('#q1'), '3');
  assert.match(await page.innerText('#err'), /Solo quedan 3/);
  assert.ok(await page.isDisabled('button[data-a=plus][data-id="3"]'));
  assert.match(await page.locator('#productos').innerText(), /Agotado/);
  await page.close();
});

test('esquina: no baja de 0 al quitar', async () => {
  const { page } = await abrir('/');
  await page.click('button[data-a=minus][data-id="2"]');
  assert.equal(await page.innerText('#q2'), '0');
  await page.close();
});

test('validación: sin productos, nombre vacío y celular inválido', async () => {
  const { page } = await abrir('/');
  await page.click('#enviar');
  assert.match(await page.innerText('#err'), /al menos una/);
  await page.click('button[data-a=plus][data-id="2"]');
  await page.click('#enviar');
  assert.match(await page.innerText('#err'), /nombre/i);
  await page.fill('#nombre', 'Ana');
  await page.fill('#tel', 'abc');
  await page.click('#enviar');
  assert.match(await page.innerText('#err'), /celular|números/i);
  await page.close();
});

test('flujo feliz: registra el pedido (RPC) y abre WhatsApp con el mensaje', async () => {
  const { page } = await abrir('/');
  await page.click('button[data-a=plus][data-id="2"]');
  await page.fill('#nombre', 'Ana Prueba');
  await page.fill('#tel', '999111222');
  const nav = page.waitForRequest(r => r.url().startsWith('https://wa.me/51994581847'), { timeout: 5000 });
  await page.click('#enviar');
  const req = await nav;
  assert.match(decodeURIComponent(req.url()), /Ana Prueba/);
  assert.match(decodeURIComponent(req.url()), /N° 99/);
  await page.close();
});

test('diseño responsive: sin scroll horizontal en celular (375 px)', async () => {
  const { page } = await abrir('/', { viewport: { width: 375, height: 800 } });
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(sobra <= 1, 'scroll horizontal de ' + sobra + 'px');
  await page.close();
});

test('rendimiento: el catálogo carga en menos de 3 s', async () => {
  const t0 = Date.now();
  const { page } = await abrir('/');
  await page.waitForSelector('#productos .card');
  assert.ok(Date.now() - t0 < 3000);
  await page.close();
});

test('panel admin: sin sesión muestra el login', async () => {
  const { page, errores } = await abrir('/admin.html');
  assert.ok(await page.isVisible('#entrar'));
  assert.deepEqual(errores, []);
  await page.close();
});

test('panel admin: con sesión de admin lista los pedidos', async () => {
  const { page, errores } = await abrir('/admin.html', { logged: true });
  assert.match(await page.locator('body').innerText(), /María Pérez/);
  assert.deepEqual(errores, []);
  await page.close();
});
