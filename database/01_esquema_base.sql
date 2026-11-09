-- ============ SIGEPAL / ORO VERDE: base de datos ============
-- Pegar TODO esto en Supabase > SQL Editor > New query > Run

create table if not exists clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  telefono text not null unique,
  direccion text,
  creado timestamptz not null default now()
);

create table if not exists productos (
  id bigint generated always as identity primary key,
  nombre text not null default 'Aceite de palta',
  presentacion text not null,
  precio numeric(10,2) not null,
  imagen text,
  activo boolean not null default true,
  orden int not null default 0
);

create table if not exists pedidos (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references clientes(id),
  creado timestamptz not null default now(),
  direccion text,
  notas text,
  factura boolean not null default false,
  total numeric(10,2) not null default 0,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmado','en_camino','entregado','cancelado'))
);

create table if not exists detalle_pedido (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references pedidos(id) on delete cascade,
  producto_id bigint not null references productos(id),
  cantidad int not null check (cantidad > 0),
  precio_unit numeric(10,2) not null
);

create table if not exists pagos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references pedidos(id) on delete cascade,
  monto numeric(10,2) not null check (monto > 0),
  metodo text not null default 'efectivo',
  creado timestamptz not null default now()
);

-- Productos iniciales (precios reales de Oro Verde)
insert into productos (presentacion, precio, orden)
select * from (values ('250 ml',30.00,1),('500 ml',60.00,2),('1 litro',120.00,3)) v(p,pr,o)
where not exists (select 1 from productos);

-- Seguridad: nadie ve pedidos ni clientes sin iniciar sesión
alter table clientes enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table detalle_pedido enable row level security;
alter table pagos enable row level security;

create policy "publico ve productos activos" on productos for select to anon using (activo);
create policy "admin productos" on productos for all to authenticated using (true) with check (true);
create policy "admin clientes" on clientes for all to authenticated using (true) with check (true);
create policy "admin pedidos" on pedidos for all to authenticated using (true) with check (true);
create policy "admin detalle" on detalle_pedido for all to authenticated using (true) with check (true);
create policy "admin pagos" on pagos for all to authenticated using (true) with check (true);

-- Función que usa la web para registrar un pedido (calcula los precios en el servidor)
create or replace function crear_pedido(
  p_nombre text, p_telefono text, p_direccion text, p_notas text,
  p_factura boolean, p_items jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_cliente bigint; v_pedido bigint; v_total numeric := 0;
  it jsonb; v_prod record; v_cant int; v_precio numeric;
  v_recargo numeric := 5;  -- recargo por factura (IGV) por unidad
begin
  if coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_telefono),'') = '' then
    raise exception 'Faltan datos del cliente';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  select id into v_cliente from clientes where telefono = trim(p_telefono) limit 1;
  if v_cliente is null then
    insert into clientes(nombre, telefono, direccion)
    values (trim(p_nombre), trim(p_telefono), nullif(trim(coalesce(p_direccion,'')),''))
    returning id into v_cliente;
  else
    update clientes set nombre = trim(p_nombre),
      direccion = coalesce(nullif(trim(coalesce(p_direccion,'')),''), direccion)
    where id = v_cliente;
  end if;

  insert into pedidos(cliente_id, direccion, notas, factura, total)
  values (v_cliente, nullif(trim(coalesce(p_direccion,'')),''), nullif(trim(coalesce(p_notas,'')),''), coalesce(p_factura,false), 0)
  returning id into v_pedido;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    select * into v_prod from productos where id = (it->>'producto_id')::bigint and activo;
    if not found or v_cant < 1 or v_cant > 100 then
      raise exception 'Producto o cantidad inválidos';
    end if;
    v_precio := v_prod.precio + case when p_factura then v_recargo else 0 end;
    insert into detalle_pedido(pedido_id, producto_id, cantidad, precio_unit)
    values (v_pedido, v_prod.id, v_cant, v_precio);
    v_total := v_total + v_precio * v_cant;
  end loop;

  update pedidos set total = v_total where id = v_pedido;
  return json_build_object('id', v_pedido, 'total', v_total);
end $$;

grant execute on function crear_pedido(text,text,text,text,boolean,jsonb) to anon, authenticated;
