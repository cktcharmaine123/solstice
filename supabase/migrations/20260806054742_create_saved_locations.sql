/*
# Create saved locations

1. New Tables
- `saved_locations` stores locations saved from the analysis screen.
- `id` is the generated row identifier.
- `name` is the location name shown in the list.
- `latitude` and `longitude` store coordinates used to reopen the analysis.
- `created_at` records when the location was saved.

2. Security
- Row level security is enabled.
- This app has no sign-in screen, so the intentionally shared single-tenant table allows the anon and authenticated roles to perform the four required CRUD operations.

3. Important Notes
- Location names are unique so pressing Save Location again does not create a duplicate row.
*/

CREATE TABLE IF NOT EXISTS public.saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_locations_name_key UNIQUE (name)
);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read saved locations" ON public.saved_locations;
CREATE POLICY "Public can read saved locations"
  ON public.saved_locations FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can save locations" ON public.saved_locations;
CREATE POLICY "Public can save locations"
  ON public.saved_locations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update saved locations" ON public.saved_locations;
CREATE POLICY "Public can update saved locations"
  ON public.saved_locations FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can remove saved locations" ON public.saved_locations;
CREATE POLICY "Public can remove saved locations"
  ON public.saved_locations FOR DELETE
  TO anon, authenticated
  USING (true);
