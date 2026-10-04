-- PRECIOSA GESTIÓN · Migración v3
-- Nueva lógica de inventario:
-- 1) Los componentes se registran sueltos (collar, caja, etc.).
-- 2) Una unidad terminada puede combinar 2 o 3 componentes.
-- 3) El sistema calcula costo/precio, consume el stock de componentes
--    y genera automáticamente el código físico de la unidad.
-- 4) La descripción de la unidad es manual y queda visible en pedidos.

create sequence if not exists public.product_unit_seq start 1;
create sequence if not exists public.ingredient_seq start 1;

create or replace function public.make_product_unit_code()
returns text
language sql
volatile
as $$
  select 'JOY-' || lpad(nextval('public.product_unit_seq')::text, 6, '0')
$$;

create or replace function public.make_ingredient_code()
returns text
language sql
volatile
as $$
  select 'INS-' || lpad(nextval('public.ingredient_seq')::text, 6, '0')
$$;

alter table public.product_units
  add column if not exists description text;

-- Crea un componente suelto. El código se genera automáticamente.
create or replace function public.create_ingredient(
  p_name text,
  p_unit_cost numeric,
  p_stock_qty integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'El nombre es obligatorio'; end if;
  if p_unit_cost < 0 then raise exception 'El costo no puede ser negativo'; end if;
  if p_stock_qty < 0 then raise exception 'La existencia no puede ser negativa'; end if;

  loop
    v_code := public.make_ingredient_code();
    exit when not exists (select 1 from public.ingredients where code = v_code);
  end loop;

  insert into public.ingredients(code, name, unit_cost, stock_qty)
  values (v_code, trim(p_name), round(p_unit_cost,2), p_stock_qty)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_ingredient(text,numeric,integer) to authenticated;

-- Arma una unidad física a partir de 2 o 3 componentes.
-- Si ya existe una combinación idéntica, reutiliza el mismo producto/receta.
create or replace function public.assemble_unit_from_components(
  p_description text,
  p_components jsonb,
  p_multiplier numeric default 1.5
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_component jsonb;
  v_component_count integer;
  v_ingredient public.ingredients%rowtype;
  v_qty integer;
  v_cost numeric(12,2) := 0;
  v_code text;
  v_unit_id uuid;
  v_name text;
  v_existing_count integer;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;

  if trim(coalesce(p_description,'')) = '' then
    raise exception 'La descripción de la unidad es obligatoria';
  end if;

  if jsonb_typeof(p_components) <> 'array' then
    raise exception 'Los componentes deben enviarse como una lista';
  end if;

  v_component_count := jsonb_array_length(p_components);
  if v_component_count < 2 or v_component_count > 3 then
    raise exception 'Una unidad debe tener 2 o 3 componentes';
  end if;

  if p_multiplier <= 0 then
    raise exception 'El multiplicador debe ser mayor a 0';
  end if;

  -- Validar, bloquear stock y calcular costo.
  for v_component in
    select value from jsonb_array_elements(p_components)
  loop
    if not (v_component ? 'ingredient_id') then
      raise exception 'Falta ingredient_id en un componente';
    end if;

    v_qty := coalesce((v_component->>'quantity')::numeric, 0);
    if v_qty <= 0 or v_qty <> floor(v_qty) then
      raise exception 'La cantidad de cada componente debe ser un entero positivo';
    end if;

    select * into v_ingredient
    from public.ingredients
    where id = (v_component->>'ingredient_id')::uuid
      and active = true
    for update;

    if not found then
      raise exception 'El componente seleccionado no existe o está inactivo';
    end if;

    if v_ingredient.stock_qty < v_qty then
      raise exception 'Stock insuficiente de %. Disponible: %, necesario: %',
        v_ingredient.name, v_ingredient.stock_qty, v_qty;
    end if;

    v_cost := v_cost + (v_ingredient.unit_cost * v_qty);
  end loop;

  -- Evitar duplicar combinaciones idénticas.
  select p.id
  into v_product_id
  from public.products p
  where
    (select count(*) from public.product_components pc where pc.product_id = p.id) = v_component_count
    and not exists (
      select 1
      from public.product_components pc
      where pc.product_id = p.id
        and not exists (
          select 1
          from jsonb_array_elements(p_components) x
          where (x->>'ingredient_id')::uuid = pc.ingredient_id
            and (x->>'quantity')::numeric = pc.quantity
        )
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_components) x
      where not exists (
        select 1
        from public.product_components pc
        where pc.product_id = p.id
          and pc.ingredient_id = (x->>'ingredient_id')::uuid
          and pc.quantity = (x->>'quantity')::numeric
      )
    )
  limit 1;

  if v_product_id is null then
    select string_agg(i.name || case when (x->>'quantity')::numeric > 1 then ' x' || (x->>'quantity') else '' end, ' + ' order by i.code)
    into v_name
    from jsonb_array_elements(p_components) x
    join public.ingredients i on i.id = (x->>'ingredient_id')::uuid;

    insert into public.products(name, cost, multiplier, sale_price)
    values (
      coalesce(nullif(trim(v_name),''), 'Unidad terminada'),
      round(v_cost,2),
      p_multiplier,
      round(v_cost * p_multiplier,2)
    )
    returning id into v_product_id;

    for v_component in
      select value from jsonb_array_elements(p_components)
    loop
      insert into public.product_components(product_id, ingredient_id, quantity)
      values (
        v_product_id,
        (v_component->>'ingredient_id')::uuid,
        (v_component->>'quantity')::numeric
      );
    end loop;
  else
    update public.products
    set cost = round(v_cost,2),
        multiplier = p_multiplier,
        sale_price = round(v_cost * p_multiplier,2)
    where id = v_product_id;
  end if;

  -- Consumir componentes físicamente.
  update public.ingredients i
  set stock_qty = i.stock_qty - (v_component->>'quantity')::integer
  from jsonb_array_elements(p_components) v_component
  where i.id = (v_component->>'ingredient_id')::uuid;

  loop
    v_code := public.make_product_unit_code();
    exit when not exists (select 1 from public.product_units where code = v_code);
  end loop;

  insert into public.product_units(product_id, code, description, status)
  values (v_product_id, v_code, trim(p_description), 'available')
  returning id into v_unit_id;

  update public.products
  set cost = round(v_cost,2),
      sale_price = round(v_cost * multiplier,2)
  where id = v_product_id;

  insert into public.audit_log(actor_id, entity_type, entity_id, action, details)
  values (
    auth.uid(),
    'product_unit',
    v_unit_id::text,
    'assembled',
    jsonb_build_object(
      'product_id', v_product_id,
      'code', v_code,
      'description', trim(p_description),
      'cost', round(v_cost,2)
    )
  );

  return v_code;
end;
$$;

grant execute on function public.assemble_unit_from_components(text,jsonb,numeric) to authenticated;

-- Compatibilidad: la interfaz anterior seguirá funcionando si alguna vez se usa.
drop function if exists public.assemble_product_unit(uuid,text);

create or replace function public.assemble_product_unit(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_product public.products%rowtype;
  v_component record;
  v_cost numeric(12,2) := 0;
  v_unit_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;

  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'No existe el producto'; end if;

  for v_component in
    select pc.quantity, i.unit_cost, i.stock_qty, i.name
    from public.product_components pc