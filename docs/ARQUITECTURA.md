# Arquitectura

## Estilo
Aplicación web **estática** (sin servidor propio) que usa **Supabase como backend**. Es una arquitectura cliente-servidor por capas:

| Capa | Dónde | Responsabilidad |
|---|---|---|
| Presentación | `index.html`, `admin.html`, `css/` | Interfaz responsive |
| Lógica de cliente | `js/index.js`, `js/admin.js` | Eventos, render, llamadas a Supabase |
| Lógica pura | `js/logic.js` | Totales, validación, mensaje de WhatsApp (sin DOM ni red → se prueba con tests unitarios) |
| Datos y reglas | Supabase (PostgreSQL) | Tablas, RLS, funciones y triggers (`database/`) |

Principios aplicados: **separación de responsabilidades** (la lógica de negocio sale de la interfaz), **DRY** (funciones compartidas en `logic.js`) y **KISS** (sin frameworks ni compilación).

## Modelo de datos

```mermaid
erDiagram
  clientes ||--o{ pedidos : realiza
  pedidos  ||--|{ detalle_pedido : contiene
  productos ||--o{ detalle_pedido : "se vende en"
  pedidos  ||--o{ pagos : recibe
  admins {
    uuid user_id
  }
  clientes {
    bigint id
    text nombre
    text telefono
    text email
    uuid user_id
  }
  productos {
    bigint id
    text presentacion
    numeric precio
    int stock
    int stock_minimo
    bool activo
  }
  pedidos {
    bigint id
    bool factura
    numeric total
    text estado
  }
```

## Flujo de un pedido

```mermaid
sequenceDiagram
  participant C as Cliente
  participant W as Web (js/index.js)
  participant S as Supabase
  participant WA as WhatsApp
  C->>W: Elige productos y llena sus datos
  W->>W: validarPedido() (logic.js)
  W->>S: rpc crear_pedido(items)
  S->>S: Verifica stock, recalcula total, descuenta stock
  S-->>W: {id, total}
  W->>WA: Abre wa.me con el mensaje del pedido
  C->>WA: Toca "Enviar"
```

## Estados del pedido
`pendiente → confirmado → en_camino → entregado` (o `cancelado`, que devuelve el stock mediante el trigger `ajustar_stock_por_estado`).

## API
No hay API propia. Supabase expone una API REST/RPC generada a partir del esquema; las operaciones usadas son: lectura de `productos`, `rpc('crear_pedido')`, `rpc('es_admin')`, y lecturas/actualizaciones de `pedidos`, `clientes` y `pagos` sujetas a RLS.
