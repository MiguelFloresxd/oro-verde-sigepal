/* Genera las capturas de docs/capturas con datos simulados: node tests/e2e/capturas.js */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), FAKE = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
(async () => {
  const srv = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0].replace(/^\/$/, '/index.html'));
    if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch(); const out = path.join(ROOT, 'docs', 'capturas');
  async function pg(url, logged, vp) {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
    await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base)) return r.continue();
      if (u.includes('supabase')) return r.fulfill({ body: FAKE, contentType: 'text/javascript' }); return r.abort(); });
    await p.addInitScript('window.__LOGGED=' + logged); await p.goto(base + url); await p.waitForTimeout(500); return p; }
  let p = await pg('/', false, { width: 1280, height: 800 }); await p.screenshot({ path: out + '/01-inicio.png' });
  await p.locator('#catalogo').screenshot({ path: out + '/02-catalogo.png' });
  await p.click('button[data-a=plus][data-id="2"]'); await p.locator('#pedido').screenshot({ path: out + '/03-pedido.png' });
  await p.click('#btnCuenta'); await p.screenshot({ path: out + '/04-cuenta.png' });
  p = await pg('/', false, { width: 390, height: 844 }); await p.screenshot({ path: out + '/05-movil.png' });
  p = await pg('/admin.html', true, { width: 1280, height: 900 }); await p.screenshot({ path: out + '/06-admin-pedidos.png' });
  await p.click('[data-t=productos]'); await p.screenshot({ path: out + '/07-admin-stock.png' });
  await b.close(); srv.close();
})();
