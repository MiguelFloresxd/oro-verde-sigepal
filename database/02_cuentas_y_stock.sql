-- ============ ACTUALIZACIÓN v2: cuentas de clientes ============
-- Ejecutar en Supabase > SQL Editor > New query > Run  (DESPUÉS de supabase.sql)
-- ANTES de ejecutar: cambia correo_del_admin@ejemplo.com (línea marcada abajo) por el correo con el que
-- creaste su usuario en Authentication > Users.

-- 1) Clientes ahora pueden tener cuenta
alter table clientes add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table clientes add column if not exists email text;
alter table clientes drop constraint if exists clientes_telefono_key;
create unique index if not exists clientes_user_id_uidx on clientes(user_id) where user_id is not null;

-- 1b) Control de stock (NULL = sin control de stock)
alter table productos add column if not exists stock int check (stock is null or stock >= 0);
alter table productos add column if not exists stock_minimo int not null default 5 check (stock_minimo >= 0);

-- 2) Quién es administrador
create table if not exists admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table admins enable row level security;   -- sin políticas: solo se consulta con es_admin()

create or replace function es_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;
grant execute on function es_admin() to authenticated;

-- >>> CAMBIA ESTE CORREO por el de la Sra. Estefany <<<
insert into admins(user_id)
select id from auth.users where email = 'floresbermudez28@gmail.com'
on conflict do nothing;

-- 3) Seguridad nueva: cada cliente ve solo lo suyo; el administrador ve todo
drop policy if exists "admin productos" on productos;
drop policy if exists "admin clientes" on clientes;
drop policy if exists "admin pedidos" on pedidos;
drop policy if exists "admin detalle" on detalle_pedido;
drop policy if exists "admin pagos" on pagos;
drop policy if exists "autenticados ven productos activos" on productos;
drop policy if exists "cliente ve su perfil" on clientes;
drop policy if exists "cliente edita su perfil" on clientes;
drop policy if exists "cliente ve sus pedidos" on pedidos;
drop policy if exists "cliente ve su detalle" on detalle_pedido;
drop policy if exists "cliente ve sus pagos" on pagos;

create policy "admin productos" on productos for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin clientes"  on clientes  for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin pedidos"   on pedidos   for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin detalle"   on detalle_pedido for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin pagos"     on pagos     for all to authenticated using (es_admin()) with check (es_admin());

create policy "autenticados ven productos activos" on productos for select to authenticated using (activo);
create policy "cliente ve su perfil"   on clientes for select to authenticated using (user_id = auth.uid());
create policy "cliente edita su perfil" on clientes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cliente ve sus pedidos" on pedidos for select to authenticated
  using (cliente_id in (select id from clientes where user_id = auth.uid()));
create policy "cliente ve su detalle" on detalle_pedido for select to authenticated
  using (pedido_id in (select id from pedidos));
create policy "cliente ve sus pagos" on pagos for select to authenticated
  using (pedido_id in (select id from pedidos));

-- 4) Al crear una cuenta se crea (o se vincula) su ficha de cliente
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_tel text := trim(coalesce(new.raw_user_meta_data->>'telefono',''));
  v_nom text := nullif(trim(coalesce(new.raw_user_meta_data->>'nombre','')),'');
begin
  select id into v_id from clientes where user_id is null and v_tel <> '' and telefono = v_tel limit 1;
  if v_id is not null then
    update clientes set user_id = new.id, email = new.email, nombre = coalesce(v_nom, nombre) where id = v_id;
  else
    insert into clientes(nombre, telefono, email, user_id)
    values (coalesce(v_nom, split_part(new.email,'@',1)), v_tel, new.email, new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 5) crear_pedido ahora vincula el pedido a la cuenta si el cliente inició sesión
create or replace function crear_pedido(
  p_nombre text, p_telefono text, p_direccion text, p_notas text,
  p_factura boolean, p_items jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cliente bigint; v_pedido bigint; v_total numeric := 0;
  it jsonb; v_prod record; v_cant int; v_precio numeric;
  v_dir text := nullif(trim(coalesce(p_direccion,'')),'');
  v_recargo numeric := 5;  -- recargo por factura (IGV) por unidad
begin
  if coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_telefono),'') = '' then
    raise exception 'Faltan datos del cliente';
  end if;
  if length(p_nombre) > 80 or length(p_telefono) > 20 or length(coalesce(p_direccion,'')) > 200
     or length(coalesce(p_notas,'')) > 500 then
    raise exception 'Algún dato es demasiado largo';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  if v_uid is not null then
    select id into v_cliente from clientes where user_id = v_uid;
    if v_cliente is null then
      insert into clientes(nombre, telefono, direccion, user_id, email)
      values (trim(p_nombre), trim(p_telefono), v_dir, v_uid, (select email from auth.users where id = v_uid))
      returning id into v_cliente;
    else
      update clientes set nombre = trim(p_nombre), telefono = trim(p_telefono),
        direccion = coalesce(v_dir, direccion) where id = v_cliente;
    end if;
  else
    select id into v_cliente from clientes where user_id is null and telefono = trim(p_telefono) limit 1;
    if v_cliente is null then
      insert into clientes(nombre, telefono, direccion) values (trim(p_nombre), trim(p_telefono), v_dir)
      returning id into v_cliente;
    else
      update clientes set nombre = trim(p_nombre), direccion = coalesce(v_dir, direccion) where id = v_cliente;
    end if;
  end if;

  insert into pedidos(cliente_id, direccion, notas, factura, total)
  values (v_cliente, v_dir, nullif(trim(coalesce(p_notas,'')),''), coalesce(p_factura,false), 0)
  returning id into v_pedido;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    select * into v_prod from productos where id = (it->>'producto_id')::bigint and activo for update;
    if not found or v_cant < 1 or v_cant > 100 then
      raise exception 'Producto o cantidad inválidos';
    end if;
    if v_prod.stock is not null then
      if v_prod.stock < v_cant then
        raise exception 'Stock insuficiente: de % solo quedan % unidades', v_prod.presentacion, v_prod.stock;
      end if;
      update productos set stock = stock - v_cant where id = v_prod.id;
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

-- 6) Si un pedido se cancela, las unidades vuelven al stock (y si se reactiva, se descuentan otra vez)
create or replace function ajustar_stock_por_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    update productos p set stock = p.stock + d.cantidad
    from detalle_pedido d where d.pedido_id = new.id and d.producto_id = p.id and p.stock is not null;
  elsif old.estado = 'cancelado' and new.estado <> 'cancelado' then
    update productos p set stock = greatest(p.stock - d.cantidad, 0)
    from detalle_pedido d where d.pedido_id = new.id and d.producto_id = p.id and p.stock is not null;
  end if;
  return new;
end $$;
drop trigger if exists pedido_estado_stock on pedidos;
create trigger pedido_estado_stock after update of estado on pedidos
  for each row execute function ajustar_stock_por_estado();
