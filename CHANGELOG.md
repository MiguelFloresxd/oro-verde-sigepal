# Historial de cambios

## [1.0.0] — 2026-11
### Agregado
- Catálogo con precios reales (250 ml S/ 30, 500 ml S/ 60, 1 litro S/ 120) y carrito.
- Pedido por WhatsApp con mensaje prellenado y opción de factura (+S/ 5 por unidad).
- Registro de pedidos en Supabase mediante la función `crear_pedido` (total calculado en el servidor).
- Cuentas de clientes con historial de compras y repetir pedido.
- Panel de administración: pedidos, pagos, clientes (con cuenta e invitados), productos, precios y stock.
- Control de stock con alertas de poco stock y agotado; el stock se devuelve al cancelar un pedido.
- Pruebas unitarias y de extremo a extremo; integración continua con GitHub Actions.
### Seguridad
- Políticas RLS: cada cliente ve solo sus pedidos; solo `admins` accede al panel.
