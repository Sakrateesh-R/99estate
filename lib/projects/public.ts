import { cache } from 'react';
import { createClient, createDeferredClient } from '@/lib/supabase/server';
import type { Enums, Tables, Views } from '@/types/database.types';

export type PublicProject = Tables<'projects'>;
export type BuilderProfile = Views<'builder_public_profiles'>;
export type ProjectUnit = Tables<'project_units'>;
export type ProjectMediaRow = Tables<'project_media'>;

/**
 * Public reads for projects and builder profiles.
 *
 * Every query here runs as whoever is asking, usually nobody. There is no
 * `.eq('is_published', true)` in most of them and that is deliberate:
 * `projects_select_published` already restricts anonymous reads to published,
 * unsuspended projects belonging to unsuspended companies. Repeating the
 * condition in the query would be a second copy of a rule that is only true in
 * one place, and the copy is the one that goes stale.
 *
 * Note what is absent compared to a listing: no expiry, anywhere. §18 keeps a
 * completed, sold-out project public — it is the builder's track record.
 */

export type ProjectDetail = {
  project: PublicProject;
  builder: BuilderProfile | null;
  units: ProjectUnit[];
  media: ProjectMediaRow[];
  amenities: string[];
  /** True when the viewer acts for the company, so the page can say so. */
  isOwnProject: boolean;
};

/**
 * One project by its public slug, with everything the page renders.
 *
 * Returns null for a project that does not exist, is unpublished, or belongs to
 * a suspended company — RLS makes all three indistinguishable from here, which
 * is the right answer: the page 404s either way.
 */
export const getProjectDetail = cache(async (slug: string): Promise<ProjectDetail | null> => {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!project) return null;

  const [{ data: builder }, { data: units }, { data: media }, { data: amenities }, { data: auth }] =
    await Promise.all([
      supabase
        .from('builder_public_profiles')
        .select('*')
        .eq('id', project.organization_id)
        .maybeSingle(),
      supabase
        .from('project_units')
        .select('*')
        .eq('project_id', project.id)
        // Available first, then by price: a buyer scanning the table wants to
        // know what they can actually have.
        .order('status', { ascending: true })
        .order('price', { ascending: true, nullsFirst: false })
        .order('unit_number', { ascending: true })
        .limit(500),
      supabase
        .from('project_media')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('project_amenities').select('amenity_name').eq('project_id', project.id),
      supabase.auth.getUser(),
    ]);

  let isOwnProject = false;
  if (auth?.user) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', project.organization_id)
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .maybeSingle();
    isOwnProject = Boolean(membership);
  }

  return {
    project,
    builder: builder ?? null,
    units: units ?? [],
    media: media ?? [],
    amenities: (amenities ?? []).map((a) => a.amenity_name).sort((a, b) => a.localeCompare(b)),
    isOwnProject,
  };
});

export type ProjectFilters = {
  city?: string;
  type?: Enums<'project_type'>;
  status?: Enums<'project_status'>;
  q?: string;
};

/** The browse index. Published projects only, newest first. */
export async function getPublicProjects(
  filters: ProjectFilters = {},
  limit = 48,
): Promise<PublicProject[]> {
  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (filters.city) query = query.ilike('city', filters.city);
  if (filters.type) query = query.eq('project_type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.q) {
    // Same trigram indexes the listing search uses, so this stays cheap.
    const term = `%${filters.q.replace(/[%_]/g, '')}%`;
    query = query.or(`name.ilike.${term},locality.ilike.${term},city.ilike.${term}`);
  }

  const { data } = await query;
  return data ?? [];
}

/** Distinct cities that actually have a published project, for the filter. */
export async function getProjectCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('city').limit(500);

  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    const key = row.city.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, row.city.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export type BuilderDetail = {
  builder: BuilderProfile;
  projects: PublicProject[];
};

/**
 * A builder's public profile and their projects.
 *
 * Reads `builder_public_profiles` rather than `organizations`, because that
 * view is the curated column list: no phone, no email, no GST, no admin notes.
 * The table is readable too, so selecting from it would have worked — and would
 * have put the decision about what is public into every query that asks.
 */
export const getBuilderDetail = cache(async (slug: string): Promise<BuilderDetail | null> => {
  const supabase = await createClient();

  const { data: builder } = await supabase
    .from('builder_public_profiles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!builder?.id) return null;

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('organization_id', builder.id)
    .order('is_published', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(100);

  return { builder, projects: projects ?? [] };
});

/**
 * Counts a project view once the response has gone.
 *
 * Built now, run later — `after()` receives a task that must touch no request
 * API, and `createDeferredClient` freezes the cookie jar so the session still
 * travels. That matters because `record_project_view` is where a member
 * viewing their own project could otherwise inflate the count.
 */
export async function prepareProjectViewTracking(projectId: string): Promise<() => Promise<void>> {
  const supabase = await createDeferredClient();

  return async () => {
    try {
      const { error } = await supabase.rpc('record_project_view', { p_project_id: projectId });
      if (error) {
        console.error('[analytics] record_project_view failed', {
          projectId,
          code: error.code,
          message: error.message,
        });
      }
    } catch (error) {
      console.error('[analytics] record_project_view threw', error);
    }
  };
}
