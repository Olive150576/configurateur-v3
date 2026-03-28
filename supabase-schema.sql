-- ============================================================
-- SCHÉMA SUPABASE — configurateur-v3
-- Coller dans SQL Editor → New query → Run
-- ============================================================

-- FOURNISSEURS
create table if not exists suppliers (
  id                text primary key,
  name              text not null,
  contact           text default '',
  email             text default '',
  phone             text default '',
  active            smallint default 1,
  address           text default '',
  city              text default '',
  zip               text default '',
  contact_phone     text default '',
  contact_email     text default '',
  commercial_name   text default '',
  commercial_phone  text default '',
  commercial_email  text default '',
  sav_name          text default '',
  sav_phone         text default '',
  sav_email         text default '',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- PRODUITS
create table if not exists products (
  id                  text primary key,
  name                text not null,
  supplier_id         text references suppliers(id),
  collection          text default '',
  description         text default '',
  active              smallint default 1,
  archived            smallint default 0,
  valid_from          text default null,
  valid_until         text default null,
  purchase_coefficient real not null default 2.0,
  price_rounding      text not null default 'none',
  photo               text default '',
  supplier_notes      text default '',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- GAMMES
create table if not exists ranges (
  id          text primary key,
  product_id  text not null references products(id) on delete cascade,
  name        text not null,
  base_price  real not null check(base_price >= 0),
  dimensions  text default '',
  sort_order  integer default 0
);

-- MODULES
create table if not exists modules (
  id          text primary key,
  product_id  text not null references products(id) on delete cascade,
  name        text not null,
  description text default '',
  dimensions  text default '',
  sort_order  integer default 0
);

-- PRIX DES MODULES PAR GAMME
create table if not exists module_prices (
  module_id  text not null references modules(id) on delete cascade,
  range_id   text not null references ranges(id) on delete cascade,
  price      real not null check(price >= 0),
  primary key (module_id, range_id)
);

-- OPTIONS / FINITIONS
create table if not exists options (
  id          text primary key,
  product_id  text not null references products(id) on delete cascade,
  name        text not null,
  description text default '',
  price       real not null check(price >= 0),
  type        text default '',
  coefficient real default null,
  sort_order  integer default 0
);

-- CLIENTS
create table if not exists clients (
  id         text primary key,
  name       text not null,
  email      text default '',
  phone      text default '',
  company    text default '',
  address    text default '',
  city       text default '',
  zip        text default '',
  notes      text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- DÉSACTIVER RLS (application desktop interne, accès maîtrisé)
-- ============================================================
alter table suppliers    disable row level security;
alter table products     disable row level security;
alter table ranges       disable row level security;
alter table modules      disable row level security;
alter table module_prices disable row level security;
alter table options      disable row level security;
alter table clients      disable row level security;

-- ============================================================
-- FONCTION RPC — Mise à jour des prix en masse
-- ============================================================
create or replace function bulk_update_prices(
  p_supplier_id text,
  p_collection  text,
  p_factor      real
) returns json language plpgsql as $$
declare
  affected_ids  text[];
  range_count   int := 0;
  module_count  int := 0;
  option_count  int := 0;
begin
  select array_agg(id) into affected_ids
  from products
  where archived = 0
    and (p_supplier_id = '' or supplier_id = p_supplier_id)
    and (p_collection  = '' or collection ilike '%' || p_collection || '%');

  if affected_ids is null then
    return json_build_object('products',0,'ranges',0,'modules',0,'options',0);
  end if;

  update ranges set base_price = round((base_price * p_factor)::numeric, 2)
  where product_id = any(affected_ids);
  get diagnostics range_count = row_count;

  update module_prices set price = round((price * p_factor)::numeric, 2)
  where module_id in (select id from modules where product_id = any(affected_ids));
  get diagnostics module_count = row_count;

  update options set price = round((price * p_factor)::numeric, 2)
  where product_id = any(affected_ids);
  get diagnostics option_count = row_count;

  update products set updated_at = now() where id = any(affected_ids);

  return json_build_object(
    'products', array_length(affected_ids, 1),
    'ranges',   range_count,
    'modules',  module_count,
    'options',  option_count
  );
end;
$$;
