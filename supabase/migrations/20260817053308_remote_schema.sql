-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

-- This file is a `db pull` of production as it stood on 2026-08-17, with one deliberate departure
-- from the dump: four statements were made idempotent so the file can also build an EMPTY project.
-- It could not before — `DROP EXTENSION pg_net` fails where the extension was never installed,
-- and Supabase creates `rls_auto_enable` + `ensure_rls` on new projects itself, so the dump's
-- bare CREATEs collided with them. Staging exists because of that, and so would any future
-- environment. Each departure is marked `-- idempotent:` below.
--
-- Production is unaffected: this version is already recorded in supabase_migrations.schema_migrations
-- and the CLI neither re-runs nor checksums an applied migration. A future `db pull` will drop
-- these guards again — put them back.

SET check_function_bodies = false;

-- idempotent: a fresh project has no pg_net to drop.
DROP EXTENSION IF EXISTS pg_net;

-- idempotent: pg_trgm may already be installed. It backs products_name_trgm_idx (/search).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE SEQUENCE public.banners_id_seq AS integer;

CREATE SEQUENCE public.brands_id_seq AS integer;

CREATE SEQUENCE public.cart_items_id_seq;

CREATE SEQUENCE public.categories_new_id_seq AS integer;

CREATE SEQUENCE public.favorites_id_seq;

CREATE SEQUENCE public.orders_id_seq;

CREATE SEQUENCE public.products_id_seq;

CREATE FUNCTION public.increment_product_purchase_counts (
  items jsonb
)
  RETURNS void
  LANGUAGE sql
  AS $function$
  update products p
  set purchase_count = purchase_count + i.qty
  from jsonb_to_recordset(items) as i(id int, qty int)
  where p.id = i.id;
$function$;

REVOKE ALL ON FUNCTION public.increment_product_purchase_counts(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.increment_product_purchase_counts(jsonb) TO service_role;

-- idempotent: Supabase ships this function on new projects; `db pull` captured it as if it were ours.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE TABLE public.banners (
  id         integer                  DEFAULT nextval('public.banners_id_seq'::regclass) NOT NULL,
  image_url  text                     NOT NULL,
  sort_order integer                  DEFAULT 0,
  active     boolean                  DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  link       text,
  type       text                     DEFAULT 'desktop'::text NOT NULL
);

ALTER SEQUENCE public.banners_id_seq OWNED BY public.banners.id;

GRANT ALL ON SEQUENCE public.banners_id_seq TO anon;

GRANT ALL ON SEQUENCE public.banners_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.banners_id_seq TO service_role;

ALTER TABLE public.banners
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.banners
  ADD CONSTRAINT banners_pkey PRIMARY KEY (id);

GRANT ALL ON public.banners TO anon;

GRANT ALL ON public.banners TO authenticated;

GRANT ALL ON public.banners TO service_role;

CREATE POLICY "admin write" ON public.banners
  USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text))
  WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));

CREATE POLICY "public read" ON public.banners
  FOR SELECT
  USING (true);

CREATE TABLE public.brands (
  id   integer DEFAULT nextval('public.brands_id_seq'::regclass) NOT NULL,
  name text    NOT NULL,
  slug text    NOT NULL
);

ALTER SEQUENCE public.brands_id_seq OWNED BY public.brands.id;

GRANT ALL ON SEQUENCE public.brands_id_seq TO anon;

GRANT ALL ON SEQUENCE public.brands_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.brands_id_seq TO service_role;

ALTER TABLE public.brands
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_pkey PRIMARY KEY (id);

ALTER TABLE public.brands
  ADD CONSTRAINT brands_slug_key UNIQUE (slug);

GRANT ALL ON public.brands TO anon;

GRANT ALL ON public.brands TO authenticated;

GRANT ALL ON public.brands TO service_role;

CREATE POLICY "admin write" ON public.brands
  USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text))
  WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));

CREATE POLICY "public read" ON public.brands
  FOR SELECT
  USING (true);

CREATE TABLE public.cart_items (
  id         bigint                   DEFAULT nextval('public.cart_items_id_seq'::regclass) NOT NULL,
  user_id    uuid,
  product_id bigint,
  quantity   integer                  DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.cart_items_id_seq OWNED BY public.cart_items.id;

GRANT ALL ON SEQUENCE public.cart_items_id_seq TO anon;

GRANT ALL ON SEQUENCE public.cart_items_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.cart_items_id_seq TO service_role;

ALTER TABLE public.cart_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_user_id_product_id_key UNIQUE (user_id, product_id);

GRANT ALL ON public.cart_items TO anon;

GRANT ALL ON public.cart_items TO authenticated;

GRANT ALL ON public.cart_items TO service_role;

CREATE POLICY "Users manage own cart" ON public.cart_items
  USING ((auth.uid() = user_id));

CREATE TABLE public.categories (
  name       text    NOT NULL,
  slug       text    NOT NULL,
  id         integer DEFAULT nextval('public.categories_new_id_seq'::regclass) NOT NULL,
  parent_id  integer,
  image_url  text,
  sort_order integer DEFAULT 0 NOT NULL
);

ALTER SEQUENCE public.categories_new_id_seq OWNED BY public.categories.id;

GRANT ALL ON SEQUENCE public.categories_new_id_seq TO anon;

GRANT ALL ON SEQUENCE public.categories_new_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.categories_new_id_seq TO service_role;

ALTER TABLE public.categories
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE public.categories
  ADD CONSTRAINT categories_slug_unique UNIQUE (slug);

GRANT ALL ON public.categories TO anon;

GRANT ALL ON public.categories TO authenticated;

GRANT ALL ON public.categories TO service_role;

CREATE POLICY "admin write" ON public.categories
  USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text))
  WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));

CREATE POLICY "public read" ON public.categories
  FOR SELECT
  USING (true);

CREATE TABLE public.favorites (
  id         bigint                   DEFAULT nextval('public.favorites_id_seq'::regclass) NOT NULL,
  user_id    uuid,
  product_id bigint,
  created_at timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.favorites_id_seq OWNED BY public.favorites.id;

GRANT ALL ON SEQUENCE public.favorites_id_seq TO anon;

GRANT ALL ON SEQUENCE public.favorites_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.favorites_id_seq TO service_role;

ALTER TABLE public.favorites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_user_id_product_id_key UNIQUE (user_id, product_id);

GRANT ALL ON public.favorites TO anon;

GRANT ALL ON public.favorites TO authenticated;

GRANT ALL ON public.favorites TO service_role;

CREATE POLICY "Users manage own favorites" ON public.favorites
  USING ((auth.uid() = user_id));

CREATE TABLE public.orders (
  id               bigint                   DEFAULT nextval('public.orders_id_seq'::regclass) NOT NULL,
  user_id          uuid,
  items            jsonb                    NOT NULL,
  total            numeric                  NOT NULL,
  status           text                     DEFAULT 'new'::text,
  created_at       timestamp with time zone DEFAULT now(),
  customer_name    text,
  customer_phone   text,
  customer_address text,
  comment          text,
  delivery_type    text,
  delivery_cost    numeric                  DEFAULT 0 NOT NULL
);

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;

GRANT ALL ON SEQUENCE public.orders_id_seq TO anon;

GRANT ALL ON SEQUENCE public.orders_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.orders_id_seq TO service_role;

ALTER TABLE public.orders
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.orders TO anon;

GRANT ALL ON public.orders TO authenticated;

GRANT ALL ON public.orders TO service_role;

CREATE POLICY "Admin can update orders" ON public.orders
  FOR UPDATE
  USING (((auth.jwt() ->> 'email'::text) = 'amantay.sv@gmail.com'::text));

CREATE POLICY "Admin can view all orders" ON public.orders
  FOR SELECT
  USING (((auth.jwt() ->> 'email'::text) = 'amantay.sv@gmail.com'::text));

CREATE POLICY "Users manage own orders" ON public.orders
  USING ((auth.uid() = user_id));

CREATE POLICY "own orders insert" ON public.orders
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own orders read" ON public.orders
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.products (
  id             bigint                   DEFAULT nextval('public.products_id_seq'::regclass) NOT NULL,
  external_id    text,
  name           text                     NOT NULL,
  price          numeric                  DEFAULT 0,
  image_url      text,
  product_url    text,
  category       text,
  created_at     timestamp with time zone DEFAULT now(),
  old_price      numeric,
  label          text,
  description    text,
  seo_text       text,
  category_id    integer,
  brand_id       integer,
  published      boolean                  DEFAULT true,
  purchase_count integer                  DEFAULT 0 NOT NULL
);

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;

GRANT ALL ON SEQUENCE public.products_id_seq TO anon;

GRANT ALL ON SEQUENCE public.products_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.products_id_seq TO service_role;

ALTER TABLE public.products
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products
  ADD CONSTRAINT fk_products_category_id FOREIGN KEY (category_id) REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.products
  ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.products TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.products TO authenticated;

GRANT ALL ON public.products TO service_role;

CREATE INDEX products_name_trgm_idx ON public.products USING gin (name public.gin_trgm_ops);

CREATE POLICY "public read published" ON public.products
  FOR SELECT
  USING ((published = true));

CREATE TABLE public.profiles (
  id         uuid                     NOT NULL,
  name       text,
  phone      text,
  address    text,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

GRANT ALL ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING ((auth.uid() = id));

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING ((auth.uid() = id));

-- idempotent: same story as the function above — the trigger already exists on a new project.
-- Event triggers have no CREATE OR REPLACE, so it is dropped first. Should that hit
-- "must be owner of event trigger ensure_rls", replace this pair with a DO block that swallows
-- duplicate_object: what matters is that the trigger ends up installed, not who installed it.
DROP EVENT TRIGGER IF EXISTS ensure_rls;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
