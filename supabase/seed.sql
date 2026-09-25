-- ===========================================================================
-- 99Estate — local development seed.
--
-- Applied automatically by `supabase db reset`. Creates a demo seller, a demo
-- buyer, an admin, and a handful of published listings so the home page,
-- search and the property page have something real to render.
--
-- LOCAL ONLY. Never run against a production project.
-- ===========================================================================

set client_min_messages = warning;

-- --------------------------------------------------------------------------
-- Accounts. The auth trigger mirrors each one into public.profiles.
-- --------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo.seller@99estate.local', '{"full_name":"Meera Krishnan"}', now() - interval '120 days', now()),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo.agent@99estate.local',  '{"full_name":"Karthik Realty"}', now() - interval '80 days', now()),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo.buyer@99estate.local',  '{"full_name":"Arjun Nair"}', now() - interval '10 days', now()),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo.admin@99estate.local',  '{"full_name":"Priya Admin"}', now() - interval '200 days', now())
on conflict (id) do nothing;

update public.profiles set mobile_number = '9840012301', role = 'owner'   where email = 'demo.seller@99estate.local';
update public.profiles set mobile_number = '9840012302', role = 'agent'   where email = 'demo.agent@99estate.local';
update public.profiles set mobile_number = '9840012303'                   where email = 'demo.buyer@99estate.local';
update public.profiles set mobile_number = '9840012304', role = 'admin'   where email = 'demo.admin@99estate.local';

-- --------------------------------------------------------------------------
-- Listings. Inserted as `pending`, then approved so the publication path
-- (published_at, 90-day expiry) is exercised exactly as it is in production.
-- --------------------------------------------------------------------------
insert into public.properties (
  seller_id, title, description, property_type, listing_type, price, is_negotiable,
  area, area_unit, bedrooms, bathrooms, balconies, floor_number, total_floors,
  property_age, furnishing_status, parking, facing,
  state, city, locality, pincode, address, latitude, longitude, status
) values
  ('a0000000-0000-4000-8000-000000000001',
   '3 BHK apartment in Saravanampatti with covered parking',
   'Spacious east-facing 3 BHK on the 4th floor of a gated community, five minutes from the IT park. Covered parking, 24x7 water and full power backup. The locality has schools, a hospital and two supermarkets within a kilometre.',
   'apartment', 'sale', 6500000, true,
   1250, 'sqft', 3, 2, 2, 4, 12, 5, 'semi_furnished', 1, 'east',
   'Tamil Nadu', 'Coimbatore', 'Saravanampatti', '641035', 'Flat 4B, Green Meadows, 2nd Street', 11.078500, 76.996600, 'pending'),

  ('a0000000-0000-4000-8000-000000000001',
   '2 BHK flat for rent near Gandhipuram bus stand',
   'Well-maintained 2 BHK a short walk from the Gandhipuram bus stand. Semi-furnished with wardrobes and a modular kitchen. Ideal for a small family or working professionals. Deposit negotiable for a longer lease.',
   'apartment', 'rent', 18000, true,
   900, 'sqft', 2, 2, 1, 2, 5, 9, 'semi_furnished', 1, 'north',
   'Tamil Nadu', 'Coimbatore', 'Gandhipuram', '641012', '12/4 Cross Cut Road', 11.016800, 76.965800, 'pending'),

  ('a0000000-0000-4000-8000-000000000002',
   'Independent house in RS Puram with private garden',
   'Four bedroom independent house on a quiet residential street in RS Puram. Built on 2400 sq.ft with a private garden, two-car covered parking and a separate servant quarter. Clear title, ready to move in.',
   'independent_house', 'sale', 14500000, false,
   2400, 'sqft', 4, 3, 2, 0, 2, 12, 'unfurnished', 2, 'north_east',
   'Tamil Nadu', 'Coimbatore', 'RS Puram', '641002', '48 West Lokamanya Street', 11.006300, 76.947600, 'pending'),

  ('a0000000-0000-4000-8000-000000000002',
   '2 BHK apartment for sale in Velachery, Chennai',
   'Compact and efficient 2 BHK in a well-run society off the 100 Feet Road. Walking distance to the MRTS station and Phoenix Marketcity. Lift, generator backup and CCTV throughout the block.',
   'apartment', 'sale', 8900000, true,
   1050, 'sqft', 2, 2, 1, 7, 11, 7, 'fully_furnished', 1, 'west',
   'Tamil Nadu', 'Chennai', 'Velachery', '600042', 'Block C, Lakeview Residency', 12.979500, 80.221800, 'pending'),

  ('a0000000-0000-4000-8000-000000000001',
   'Residential plot for sale in Whitefield, Bengaluru',
   'North-facing 2400 sq.ft residential plot in an approved layout with clear title and all civic approvals in place. Water and electricity connections available at the plot boundary. Ready for immediate construction.',
   'residential_plot', 'sale', 19500000, true,
   2400, 'sqft', null, null, null, null, null, null, null, 0, 'north',
   'Karnataka', 'Bengaluru', 'Whitefield', '560066', 'Site 17, Palm Grove Layout', 12.969800, 77.749900, 'pending'),

  ('a0000000-0000-4000-8000-000000000002',
   'Furnished studio apartment for rent in Hitech City',
   'Fully furnished studio in a serviced block minutes from the Hitech City MMTS. Includes air conditioning, a modular kitchenette, high-speed internet and weekly housekeeping. Suited to a single professional.',
   'studio', 'rent', 24000, false,
   520, 'sqft', 1, 1, 1, 9, 18, 3, 'fully_furnished', 1, 'south_east',
   'Telangana', 'Hyderabad', 'Hitech City', '500081', 'Tower B, Cyber Heights', 17.448600, 78.381200, 'pending');

-- Amenities for everything residential.
insert into public.property_amenities (property_id, amenity_name)
select p.id, a.name
from public.properties p
cross join (values ('Lift'), ('Power Backup'), ('Covered Parking'), ('Security'), ('24x7 Water Supply')) as a(name)
where p.property_type <> 'residential_plot'
on conflict do nothing;

insert into public.property_amenities (property_id, amenity_name)
select p.id, a.name
from public.properties p
cross join (values ('Gated Community'), ('Park / Garden'), ('Gymnasium')) as a(name)
where p.bedrooms >= 3
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Approve everything through the real moderation RPC, then feature two.
-- --------------------------------------------------------------------------
-- Impersonate the demo admin rather than approving as `postgres`. The RPC
-- requires a real admin identity, and the seed should go through exactly the
-- path the admin console does instead of being granted an exception.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';

do $$
declare r record;
begin
  for r in select id from public.properties where status = 'pending' loop
    perform public.admin_approve_property(r.id);
  end loop;
end $$;

reset role;
commit;

update public.properties
   set is_featured = true, verification_status = 'verified'
 where locality in ('Saravanampatti', 'RS Puram');

-- Stagger the publication times so "Newest first" has something to sort.
update public.properties set published_at = now() - (random() * interval '30 days');
