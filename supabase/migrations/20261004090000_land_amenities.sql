-- ===========================================================================
-- 99Estate — 026 · The things buyers actually ask about land
-- ---------------------------------------------------------------------------
-- The amenity vocabulary was written for flats: Lift, Gymnasium, Swimming Pool,
-- Modular Kitchen, Wardrobes. Almost every listing on the site is a plot, and
-- the numbers say so — twenty-five amenities, three selections across every
-- listing ever posted. A seller with two acres near Gobichettipalayam opens that
-- step, finds nothing that applies, and moves on.
--
-- What a plot buyer asks, in roughly this order: is it approved, is there
-- water, can I get to it, can I borrow against it. None of that was on offer.
--
-- "Approved" is doing the most work. DTCP is the Tamil Nadu planning approval
-- and the first question asked about any plot here; RERA is the national
-- registration and matters for anything built or being built. They are not
-- amenities in the swimming-pool sense, but this table is the vocabulary of
-- things a listing can claim, and the posting step renders it as checkboxes —
-- which is the right shape for a claim.
--
-- Sort order is assigned globally rather than per category, because the posting
-- step groups by first appearance: whatever comes first in this list is the
-- first heading a seller sees. Approvals first, decoration last.
--
-- Re-runnable: `on conflict (name)` updates rather than duplicating, so the
-- existing twenty-five keep their selections and simply get re-ordered.
-- ===========================================================================

insert into public.amenities (name, category, icon, sort_order, is_active) values
  -- Approvals and paperwork. The first question about any plot.
  ('DTCP Approved',           'approval',  'BadgeCheck',  10, true),
  ('RERA Registered',         'approval',  'BadgeCheck',  11, true),
  ('Panchayat Approved',      'approval',  'BadgeCheck',  12, true),
  ('Patta Available',         'approval',  'FileCheck',   13, true),
  ('Clear Title',             'approval',  'FileCheck',   14, true),
  ('NA Converted',            'approval',  'FileCheck',   15, true),

  -- Water. In this part of Tamil Nadu it decides whether land is usable.
  ('Bore Well',               'water',     'Droplets',    20, true),
  ('Open Well',               'water',     'Droplets',    21, true),
  ('Corporation Water',       'water',     'Droplets',    22, true),
  ('24x7 Water Supply',       'water',     'Droplets',    23, true),

  -- Getting to it, and what is already on it.
  ('Tar Road Access',         'access',    'Route',       30, true),
  ('Corner Plot',             'access',    'Map',         31, true),
  ('Compound Wall',           'access',    'BrickWall',   32, true),
  ('Fencing',                 'access',    'Fence',       33, true),
  ('Gated Layout',            'access',    'Fence',       34, true),

  -- Money.
  ('Bank Loan Available',     'finance',   'Landmark',    40, true),
  ('Negotiable Price',        'finance',   'IndianRupee', 41, true),

  -- Services on the plot.
  ('Electricity Connection',  'utility',   'Zap',         50, true),
  ('Street Lights',           'utility',   'Lightbulb',   51, true),
  ('Piped Gas',               'utility',   'Flame',       52, true),
  ('Sewage Treatment',        'utility',   'Recycle',     53, true),
  ('Rainwater Harvesting',    'utility',   'CloudRain',   54, true),
  ('Internet / Wi-Fi',        'utility',   'Wifi',        55, true),

  -- Everything that already existed, re-ordered to sit after the above.
  ('Security',                'safety',    'ShieldCheck', 60, true),
  ('CCTV Surveillance',       'safety',    'Cctv',        61, true),
  ('Gated Community',         'safety',    'Fence',       62, true),
  ('Fire Safety',             'safety',    'Flame',       63, true),

  ('Vastu Compliant',         'general',   'Compass',     70, true),
  ('Wheelchair Accessible',   'general',   'Accessibility', 71, true),
  ('Pet Friendly',            'general',   'PawPrint',    72, true),

  ('Covered Parking',         'parking',   'Car',         80, true),
  ('Visitor Parking',         'parking',   'Car',         81, true),

  ('Lift',                    'building',  'ArrowUpDown', 90, true),
  ('Power Backup',            'building',  'BatteryCharging', 91, true),

  ('Air Conditioning',        'interior',  'Snowflake',   100, true),
  ('Modular Kitchen',         'interior',  'ChefHat',     101, true),
  ('Wardrobes',               'interior',  'DoorOpen',    102, true),

  ('Gymnasium',               'lifestyle', 'Dumbbell',    110, true),
  ('Swimming Pool',           'lifestyle', 'Waves',       111, true),
  ('Clubhouse',               'lifestyle', 'Building2',   112, true),
  ('Children''s Play Area',   'lifestyle', 'ToyBrick',    113, true),
  ('Park / Garden',           'lifestyle', 'Trees',       114, true),
  ('Jogging Track',           'lifestyle', 'Footprints',  115, true)
on conflict (name) do update
  set category   = excluded.category,
      icon       = excluded.icon,
      sort_order = excluded.sort_order,
      is_active  = excluded.is_active;

-- `24x7 Water Supply` moves from `building` to `water`, which is where someone
-- looking at a plot would expect to find it. Selections already made reference
-- the name and are unaffected.
