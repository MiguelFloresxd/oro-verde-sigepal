const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../js/logic.js');

const prods = [
  { id: 1, presentacion: '250 ml', precio: 30, stock: 3 },
  { id: 2, presentacion: '500 ml', precio: 60, stock: null },
  { id: 3, presentacion: '1 litro', precio: 120, stock: 0 },
];

test('calcula el total sin factura', () => {
  const t = L.calcularPedido(prods, { 1: 2, 2: 1 }, false, 5);
  assert.equal(t.unidades, 3);
  assert.equal(t.total, 120);
});

test('con factura suma S/ 5 por unidad', () => {
  const t = L.calcularPedido(prods, { 1: 2, 2: 1 }, true, 5);
  assert.equal(t.total, 135);
});

test('carrito vacío o con cantidades 0 no genera líneas', () => {
  assert.equal(L.calcularPedido(prods, {}, false, 5).lines.length, 0);
  assert.equal(L.calcularPedido(prods, { 1: 0 }, false, 5).total, 0);
});

test('tope respeta el stock y el máximo de 99', () => {
  assert.equal(L.tope(prods[0]), 3);
  assert.equal(L.tope(prods[1]), 99);
  assert.equal(L.tope(prods[2]), 0);
  assert.equal(L.tope({ stock: 500 }), 99);
});

const ok = { nombre: 'María', tel: '999 111 222', dir: '', notas: '' };
const conItem = L.calcularPedido(prods, { 2: 1 }, false, 5);
const vacio = L.calcularPedido(prods, {}, false, 5);

test('valida pedido correcto', () => assert.equal(L.validarPedido(conItem, ok), ''));
test('rechaza pedido sin productos', () => assert.match(L.validarPedido(vacio, ok), /al menos una/));
test('rechaza nombre vacío o de 1 letra', () => {
  assert.match(L.validarPedido(conItem, { ...ok, nombre: '' }), /nombre/);
  assert.match(L.validarPedido(conItem, { ...ok, nombre: ' a ' }), /nombre/);
});
test('rechaza nombre demasiado largo', () =>
  assert.match(L.validarPedido(conItem, { ...ok, nombre: 'x'.repeat(81) }), /largo/));
test('rechaza celular con letras, corto o muy largo', () => {
  assert.match(L.validarPedido(conItem, { ...ok, tel: 'abc123456' }), /números/);
  assert.match(L.validarPedido(conItem, { ...ok, tel: '12345' }), /válido/);
  assert.match(L.validarPedido(conItem, { ...ok, tel: '1'.repeat(16) }), /válido/);
});
test('rechaza notas y dirección excesivas', () => {
  assert.match(L.validarPedido(conItem, { ...ok, notas: 'n'.repeat(501) }), /notas/i);
  assert.match(L.validarPedido(conItem, { ...ok, dir: 'd'.repeat(201) }), /dirección/i);
});

test('escapa HTML (evita XSS)', () => {
  assert.equal(L.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(L.esc(null), '');
  assert.equal(L.esc('"a" & \'b\''), '&quot;a&quot; &amp; &#39;b&#39;');
});

test('formatea dinero', () => {
  assert.equal(L.money(30), 'S/ 30.00');
  assert.equal(L.money(undefined), 'S/ 0.00');
});

test('arma el mensaje de WhatsApp', () => {
  const t = L.calcularPedido(prods, { 2: 2 }, true, 5);
  const m = L.armarMensaje(t, 7, t.total, { nombre: 'Ana', tel: '999', dir: 'Calle 1', notas: '' }, 5);
  assert.match(m, /N° 7/);
  assert.match(m, /2 × Aceite de palta 500 ml — S\/ 130\.00/);
  assert.match(m, /con factura/);
  assert.match(m, /Dirección: Calle 1/);
  assert.doesNotMatch(m, /Notas:/);
});

test('el enlace de WhatsApp lleva el número y el texto codificado', () => {
  const u = L.urlWhatsApp('51994581847', 'Hola & chau\nlínea');
  assert.ok(u.startsWith('https://wa.me/51994581847?text='));
  assert.ok(!u.includes('\n') && !u.includes(' '));
});
