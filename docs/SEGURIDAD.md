# Seguridad

## ¿Hay credenciales en el código?
`config.js` contiene la **URL del proyecto** y la **clave `anon`** de Supabase. Ambas son **públicas por diseño**: cualquier sitio que use Supabase desde el navegador las incluye,
y cualquiera podría verlas en las herramientas del navegador. Lo que protege los datos son las políticas **Row Level Security (RLS)**.

| Elemento | ¿Está en el repo? | Motivo |
|---|---|---|
| URL del proyecto Supabase | Sí | Pública |
| Clave `anon` | Sí | Pública; limitada por RLS |
| Clave `service_role` | **No, nunca** | Salta RLS; sería crítico |
| Contraseña de base de datos | **No** | Solo se usa en el panel de Supabase |
| Correo/contraseña de la administradora | **No** | Solo en Supabase Auth |

`.gitignore` bloquea `.env`, `*service_role*` y `*.secret`. `config.example.js` es la plantilla para quien clone el proyecto.

## Controles implementados
1. **RLS en todas las tablas.** Un cliente autenticado solo lee sus pedidos; solo quien esté en `admins` ve y modifica todo.
2. **Precio calculado en el servidor.** `crear_pedido` ignora cualquier precio enviado por el navegador y usa el de la tabla `productos`.
3. **Stock verificado en el servidor** (no basta la validación del navegador).
4. **Escape de HTML** de todo dato mostrado (`esc()` en `js/logic.js`, con prueba unitaria).
5. **Cabeceras de seguridad** en `netlify.toml` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
6. `admin.html` lleva `noindex` y verifica `es_admin()` tras el login.

## Riesgos pendientes / mejoras futuras
- Limitar la frecuencia de pedidos anónimos (anti-spam) con CAPTCHA o límites por IP.
- Añadir `Content-Security-Policy` estricta (hoy se usan estilos y scripts en archivos propios, lo que lo facilita).
- Respaldo periódico de la base de datos.
