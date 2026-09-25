-- ===========================================================================
-- 99Estate — 012 · Storage buckets and object policies
-- ---------------------------------------------------------------------------
-- Two buckets:
--   property-images    public read (listing photos are the product), writes
--                      restricted to the listing owner
--   verification-docs  fully private; owner + admin only
--
-- Both rely on a path convention of `properties/<property_id>/<file>` so an
-- object's owner can be derived from its key without a second lookup table.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- `properties/<uuid>/<file>` → <uuid>, or NULL if the key does not follow the
-- convention. Returning NULL (instead of raising) matters: a policy that
-- errors on a malformed key would surface as a 500, whereas NULL simply fails
-- the ownership test and yields a clean 403.
-- ---------------------------------------------------------------------------
create or replace function public.storage_path_property_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_id    uuid;
begin
  if array_length(v_parts, 1) < 3 or v_parts[1] <> 'properties' then
    return null;
  end if;
  begin
    v_id := v_parts[2]::uuid;
  exception when others then
    return null;
  end;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- property-images
-- ---------------------------------------------------------------------------
-- Reads are open because the bucket is public and listings are free to browse
-- (Rule 2). Writes are not: §13 "do not expose unrestricted storage write
-- access".
drop policy if exists property_images_read on storage.objects;
create policy property_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'property-images');

drop policy if exists property_images_insert on storage.objects;
create policy property_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-images'
    and public.owns_property(public.storage_path_property_id(name))
  );

drop policy if exists property_images_update on storage.objects;
create policy property_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  )
  with check (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

drop policy if exists property_images_delete on storage.objects;
create policy property_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- verification-docs — ownership papers. Private bucket, signed URLs only.
-- ---------------------------------------------------------------------------
drop policy if exists verification_docs_read on storage.objects;
create policy verification_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

drop policy if exists verification_docs_insert on storage.objects;
create policy verification_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and public.owns_property(public.storage_path_property_id(name))
  );

drop policy if exists verification_docs_delete on storage.objects;
create policy verification_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );
