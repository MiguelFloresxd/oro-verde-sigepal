# Plan de pruebas

Ejecutar: `npm test`.

## Unitarias (`tests/unit/logic.test.js`, 14)
Total con y sin factura, carrito vacío, tope por stock, validación (nombre vacío/largo, celular con letras/corto/largo, notas y dirección excesivas),
escape de HTML, formato de dinero, mensaje y enlace de WhatsApp.

## Extremo a extremo (`tests/e2e/flujos.test.js`, 10)
Catálogo con precios reales, carrito y recargo, **casos de esquina** (stock, no bajar de 0, producto agotado), formulario inválido,
flujo completo hasta abrir WhatsApp con el N° de pedido, **responsive** a 375 px, **tiempo de carga** < 3 s, login y listado del panel.
Se usa un Supabase simulado (`fake-supabase.js`), así las pruebas no dependen de internet ni tocan datos reales.

## Pruebas manuales recomendadas (en la web desplegada)
| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Pedir sin elegir producto | Mensaje "Elige al menos una presentación" |
| 2 | Pedir con celular "abc" | Mensaje de celular inválido |
| 3 | Pedir más unidades que el stock | La web limita la cantidad y avisa |
| 4 | Crear cuenta, pedir y entrar a "Mis pedidos" | El pedido aparece en el historial |
| 5 | Cliente intenta abrir `/admin.html` | No ve datos (RLS y verificación `es_admin`) |
| 6 | Admin cancela un pedido | El stock se devuelve |
