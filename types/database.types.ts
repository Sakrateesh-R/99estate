/**
 * Typed contract for the 99Estate Postgres schema.
 *
 * Mirrors `supabase/migrations/*`. Regenerate against a live database with:
 *
 *   npm run db:types        # supabase gen types typescript --local
 *
 * Generated columns (`is_profile_complete`, `area_sqft`, `is_verified`,
 * `price_per_sqft`, `search_vector`) are present on Row but absent from
 * Insert/Update — the database computes them and refuses to be told otherwise.
 *
 * So are the columns a guard trigger reverts: a verification status, an
 * `is_featured` flag and every denormalised counter are absent from Insert and
 * Update even though they exist on the row, because the only thing that can
 * move them is an admin RPC. A column missing from Insert here is a rule, not
 * an oversight.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      amenities: {
        Row: {
          id: string;
          name: string;
          category: string;
          icon: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string;
          icon?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          icon?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };

      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          is_public: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          is_public?: boolean;
          updated_by?: string | null;
        };
        Update: {
          value?: Json;
          description?: string | null;
          is_public?: boolean;
          updated_by?: string | null;
        };
        Relationships: [];
      };

      client_errors: {
        Row: {
          id: string;
          user_id: string | null;
          kind: Database["public"]["Enums"] extends never ? string : string;
          message: string;
          context: Json;
          user_agent: string | null;
          created_at: string;
        };
        /** Reported by the browser; RLS requires user_id = auth.uid(). */
        Insert: {
          user_id: string;
          kind: "image_compression" | "image_upload" | "payment" | "unexpected";
          message: string;
          context?: Json;
          user_agent?: string | null;
        };
        /** A log that can be edited is not a log: no update policy exists. */
        Update: never;
        Relationships: [
          { foreignKeyName: "client_errors_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };

      contact_unlocks: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          seller_id: string;
          amount: number;
          currency: string;
          is_free: boolean;
          payment_id: string | null;
          payment_status: Database['public']['Enums']['payment_status'];
          unlocked_at: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'contact_unlocks_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'contact_unlocks_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'contact_unlocks_seller_id_fkey'; columns: ['seller_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      /**
       * One inbox for both kinds of lead. A settled ₹9 unlock fills in
       * property_id / seller_id / contact_unlock_id; a project enquiry fills in
       * project_id / organization_id and leaves those three NULL. Which of the
       * two a row is, is `source` — and `leads_unlock_source_check` makes the
       * two sets disjoint, so a project lead can never be counted as revenue.
       */
      leads: {
        Row: {
          id: string;
          /** NULL for a project enquiry. At least one of this and project_id is set. */
          property_id: string | null;
          /** NULL for a project enquiry — the counterparty there is an organization. */
          seller_id: string | null;
          buyer_id: string;
          /** Non-NULL exactly when source is 'contact_unlock'. The money path. */
          contact_unlock_id: string | null;
          project_id: string | null;
          /** The specific unit enquired about, if any. Survives the unit's deletion. */
          unit_id: string | null;
          /** Who answers this lead. Always set when project_id is. */
          organization_id: string | null;
          source: Database['public']['Enums']['lead_source'];
          assigned_to: string | null;
          /** What the buyer typed into the enquiry form, not their profile name. */
          contact_name: string | null;
          /**
           * PRIVATE — the number the buyer volunteered. Distinct from
           * profiles.mobile_number, which Rule 8 reserves for a settled unlock.
           */
          contact_mobile: string | null;
          message: string | null;
          status: Database['public']['Enums']['lead_status'];
          notes: string | null;
          last_status_change_at: string;
          created_at: string;
          updated_at: string;
        };
        /** Created only by request_contact_unlock() or submit_project_enquiry(). */
        Insert: never;
        /** The guard trigger rejects every other column, including the buyer's own words. */
        Update: {
          status?: Database['public']['Enums']['lead_status'];
          notes?: string | null;
          /** Managers only; and only to a member of the same organization. */
          assigned_to?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'leads_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'leads_buyer_id_fkey'; columns: ['buyer_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'leads_project_id_fkey'; columns: ['project_id']; referencedRelation: 'projects'; referencedColumns: ['id'] },
          { foreignKeyName: 'leads_unit_id_fkey'; columns: ['unit_id']; referencedRelation: 'project_units'; referencedColumns: ['id'] },
          { foreignKeyName: 'leads_organization_id_fkey'; columns: ['organization_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'leads_assigned_to_fkey'; columns: ['assigned_to']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      locations: {
        Row: {
          id: string;
          country: string;
          state: string;
          city: string;
          locality: string | null;
          pincode: string | null;
          latitude: number | null;
          longitude: number | null;
          is_active: boolean;
          is_popular: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          country?: string;
          state: string;
          city: string;
          locality?: string | null;
          pincode?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_active?: boolean;
          is_popular?: boolean;
          sort_order?: number;
        };
        Update: {
          country?: string;
          state?: string;
          city?: string;
          locality?: string | null;
          pincode?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_active?: boolean;
          is_popular?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string | null;
          type: Database['public']['Enums']['notification_type'];
          link: string | null;
          data: Json;
          is_read: boolean;
          created_at: string;
        };
        Insert: never;
        /** Recipients may only mark as read; a trigger reverts everything else. */
        Update: { is_read?: boolean };
        Relationships: [
          { foreignKeyName: 'notifications_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      /**
       * Who may act for an organization, and in what capacity. Every org-scoped
       * RLS policy resolves through this table, so a row here is the only thing
       * that grants any project right at all.
       */
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: Database['public']['Enums']['org_member_role'];
          status: Database['public']['Enums']['org_member_status'];
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: Database['public']['Enums']['org_member_role'];
          status?: Database['public']['Enums']['org_member_status'];
          /** Stamped with auth.uid() by the guard trigger; never write it. */
          invited_by?: never;
        };
        /**
         * Owner/admin only, and never your own row — the guard refuses
         * self-promotion. A constraint trigger also refuses to leave the
         * organization without an active owner.
         */
        Update: {
          role?: Database['public']['Enums']['org_member_role'];
          status?: Database['public']['Enums']['org_member_status'];
        };
        Relationships: [
          { foreignKeyName: 'organization_members_organization_id_fkey'; columns: ['organization_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'organization_members_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'organization_members_invited_by_fkey'; columns: ['invited_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      /**
       * A seat offered to an email address (§3).
       *
       * Keyed by email rather than by `user_id`, because a colleague who has
       * never signed in has no `profiles` row to point at — and because there
       * is no mailer in this project, so an invitation has to work by waiting
       * for them at sign-in rather than by being sent to them.
       * `accept_pending_invitations()` is what converts it.
       */
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          /** Always lower-cased; matched against the verified address on the JWT. */
          email: string;
          role: Database['public']['Enums']['org_member_role'];
          status: Database['public']['Enums']['org_invitation_status'];
          invited_by: string | null;
          accepted_by: string | null;
          created_at: string;
          expires_at: string;
          responded_at: string | null;
        };
        /** Owner or admin of the company. */
        Insert: {
          organization_id: string;
          email: string;
          /**
           * Anything but `owner` — `organization_invitations_role_check`
           * refuses that. Ownership is transferred deliberately by an existing
           * owner, not handed out in a form where a mistyped address would give
           * away the company.
           */
          role?: Database['public']['Enums']['org_member_role'];
          /** Defaults to `invitation_validity_days` from app_settings. */
          expires_at?: string;
        };
        /** Withdrawing an offer is the only change a person may make. */
        Update: { status?: 'revoked' };
        Relationships: [
          { foreignKeyName: 'organization_invitations_organization_id_fkey'; columns: ['organization_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'organization_invitations_invited_by_fkey'; columns: ['invited_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'organization_invitations_accepted_by_fkey'; columns: ['accepted_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      /**
       * A builder / promoter / developer / agency. Public profile lives at
       * /builders/<slug>; the non-sensitive columns are also exposed as the
       * `builder_public_profiles` view for anonymous reads.
       */
      organizations: {
        Row: {
          id: string;
          created_by: string | null;
          name: string;
          /** Assigned once on insert and stable across a rename — it is a public URL. */
          slug: string;
          org_types: Database['public']['Enums']['organization_type'][];
          logo_url: string | null;
          cover_image_url: string | null;
          about: string | null;
          established_year: number | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          office_address: string | null;
          locality: string | null;
          city: string | null;
          state: string | null;
          country: string;
          pincode: string | null;
          /** A registration identifier, not a document. Shown publicly, as on a brochure. */
          gst_number: string | null;
          rera_number: string | null;
          verification_status: Database['public']['Enums']['entity_verification_status'];
          /** Generated from verification_status. There is no writable "verified" flag. */
          is_verified: boolean;
          verified_at: string | null;
          admin_notes: string | null;
          projects_count: number;
          created_at: string;
          updated_at: string;
        };
        /**
         * Self-onboarding, gated on a complete profile. The guard trigger pins
         * created_by to auth.uid() and caps how many one account may create
         * (`max_organizations_per_user`).
         */
        Insert: {
          id?: string;
          name: string;
          /** Derived from the name when omitted; pass one only to choose it explicitly. */
          slug?: string;
          org_types?: Database['public']['Enums']['organization_type'][];
          logo_url?: string | null;
          cover_image_url?: string | null;
          about?: string | null;
          established_year?: number | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          office_address?: string | null;
          locality?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string;
          pincode?: string | null;
          gst_number?: string | null;
          rera_number?: string | null;
        };
        /**
         * Owner/admin of the organization only. verification_status and the
         * counters are absent because the guard trigger reverts them — the
         * badge moves only through admin_verify_organization().
         */
        Update: Partial<Omit<Database['public']['Tables']['organizations']['Insert'], 'id'>>;
        Relationships: [
          { foreignKeyName: 'organizations_created_by_fkey'; columns: ['created_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      payments: {
        Row: {
          id: string;
          user_id: string;
          property_id: string | null;
          contact_unlock_id: string | null;
          amount: number;
          currency: string;
          provider: string;
          provider_order_id: string | null;
          provider_payment_id: string | null;
          status: Database['public']['Enums']['payment_status'];
          failure_reason: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'payments_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          /** PRIVATE — never select this into a public response. */
          mobile_number: string | null;
          avatar_url: string | null;
          role: Database['public']['Enums']['user_role'];
          account_status: Database['public']['Enums']['account_status'];
          is_profile_complete: boolean;
          /** Admin-created record with no usable email: cannot sign in and claim itself. */
          is_placeholder: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          mobile_number?: string | null;
          avatar_url?: string | null;
          role?: Database['public']['Enums']['user_role'];
          is_placeholder?: boolean;
        };
        Update: {
          full_name?: string | null;
          mobile_number?: string | null;
          avatar_url?: string | null;
          role?: Database['public']['Enums']['user_role'];
          account_status?: Database['public']['Enums']['account_status'];
          /** Pinned for non-admins by profiles_guard_placeholder. */
          is_placeholder?: boolean;
        };
        Relationships: [
          { foreignKeyName: 'profiles_id_fkey'; columns: ['id']; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
      };

      /** Same shape as property_amenities: a name against the shared `amenities` vocabulary. */
      project_amenities: {
        Row: { id: string; project_id: string; amenity_name: string; created_at: string };
        Insert: { id?: string; project_id: string; amenity_name: string };
        Update: { amenity_name?: string };
        Relationships: [
          { foreignKeyName: 'project_amenities_project_id_fkey'; columns: ['project_id']; referencedRelation: 'projects'; referencedColumns: ['id'] },
        ];
      };

      /** Towers / blocks. Never required — a plot layout has none. */
      project_buildings: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          code: string | null;
          total_floors: number | null;
          total_units: number | null;
          status: Database['public']['Enums']['building_status'];
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          code?: string | null;
          total_floors?: number | null;
          total_units?: number | null;
          status?: Database['public']['Enums']['building_status'];
          sort_order?: number;
        };
        Update: Partial<Omit<Database['public']['Tables']['project_buildings']['Insert'], 'id' | 'project_id'>>;
        Relationships: [
          { foreignKeyName: 'project_buildings_project_id_fkey'; columns: ['project_id']; referencedRelation: 'projects'; referencedColumns: ['id'] },
        ];
      };

      project_floors: {
        Row: {
          id: string;
          building_id: string;
          floor_number: number;
          /** "Ground Floor", "Stilt" — the brochure's label, not derivable from the number. */
          display_name: string | null;
          created_at: string;
        };
        Insert: { id?: string; building_id: string; floor_number: number; display_name?: string | null };
        Update: { floor_number?: number; display_name?: string | null };
        Relationships: [
          { foreignKeyName: 'project_floors_building_id_fkey'; columns: ['building_id']; referencedRelation: 'project_buildings'; referencedColumns: ['id'] },
        ];
      };

      project_media: {
        Row: {
          id: string;
          project_id: string;
          type: Database['public']['Enums']['project_media_type'];
          /** Object key in the `project-media` bucket. NULL for a video, which is linked. */
          storage_path: string | null;
          url: string;
          title: string | null;
          sort_order: number;
          is_primary: boolean;
          width: number | null;
          height: number | null;
          byte_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          type?: Database['public']['Enums']['project_media_type'];
          /** Must start `projects/<project_id>/` or the CHECK rejects it. */
          storage_path?: string | null;
          url: string;
          title?: string | null;
          sort_order?: number;
          is_primary?: boolean;
          width?: number | null;
          height?: number | null;
          byte_size?: number | null;
        };
        Update: { type?: Database['public']['Enums']['project_media_type']; title?: string | null; sort_order?: number; is_primary?: boolean };
        Relationships: [
          { foreignKeyName: 'project_media_project_id_fkey'; columns: ['project_id']; referencedRelation: 'projects'; referencedColumns: ['id'] },
        ];
      };

      /**
       * Inventory. One table for flats and plots: building_id / floor_id are
       * NULL for a layout, and layout_row / layout_col are what a visual plot
       * map reads.
       */
      project_units: {
        Row: {
          id: string;
          project_id: string;
          building_id: string | null;
          floor_id: string | null;
          unit_number: string;
          /** The brochure's own words ("2 BHK", "Corner Plot"). A label, not a taxonomy. */
          unit_type: string | null;
          property_type: Database['public']['Enums']['property_type'];
          bedrooms: number | null;
          bathrooms: number | null;
          balconies: number | null;
          built_up_area: number | null;
          carpet_area: number | null;
          land_area: number | null;
          area_unit: Database['public']['Enums']['area_unit'];
          /** Generated from whichever area this row carries, for sorting and range filters. */
          area_sqft: number | null;
          facing: Database['public']['Enums']['facing_direction'] | null;
          floor_number: number | null;
          price: number | null;
          /** Generated. */
          price_per_sqft: number | null;
          maintenance_fee: number | null;
          parking_details: string | null;
          plot_dimensions: string | null;
          road_width_ft: number | null;
          is_corner: boolean;
          /** NULL until somebody draws the layout. */
          layout_row: number | null;
          layout_col: number | null;
          status: Database['public']['Enums']['unit_status'];
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Owner, admin or sales manager of the organization. */
        Insert: {
          id?: string;
          project_id: string;
          /** Must belong to the same project, or the parentage trigger refuses it. */
          building_id?: string | null;
          /** Must belong to the given building. Requires building_id. */
          floor_id?: string | null;
          unit_number: string;
          unit_type?: string | null;
          property_type: Database['public']['Enums']['property_type'];
          bedrooms?: number | null;
          bathrooms?: number | null;
          balconies?: number | null;
          built_up_area?: number | null;
          carpet_area?: number | null;
          land_area?: number | null;
          area_unit?: Database['public']['Enums']['area_unit'];
          facing?: Database['public']['Enums']['facing_direction'] | null;
          floor_number?: number | null;
          price?: number | null;
          maintenance_fee?: number | null;
          parking_details?: string | null;
          plot_dimensions?: string | null;
          road_width_ft?: number | null;
          is_corner?: boolean;
          layout_row?: number | null;
          layout_col?: number | null;
          status?: Database['public']['Enums']['unit_status'];
          description?: string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['project_units']['Insert'], 'id'>>;
        Relationships: [
          { foreignKeyName: 'project_units_project_id_fkey'; columns: ['project_id']; referencedRelation: 'projects'; referencedColumns: ['id'] },
          { foreignKeyName: 'project_units_building_id_fkey'; columns: ['building_id']; referencedRelation: 'project_buildings'; referencedColumns: ['id'] },
          { foreignKeyName: 'project_units_floor_id_fkey'; columns: ['floor_id']; referencedRelation: 'project_floors'; referencedColumns: ['id'] },
        ];
      };

      /**
       * A builder's development. Stays publicly visible when complete and sold
       * out — it is the builder's track record, so there is deliberately no
       * expiry and no availability condition on its read policy.
       */
      projects: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string | null;
          name: string;
          slug: string;
          /** The builder's own reference ("ABCH-P2"), unique inside the organization. */
          project_code: string | null;
          description: string | null;
          project_type: Database['public']['Enums']['project_type'];
          /** Unit-level taxonomy, shared with listings. Empty means mixed. */
          property_types: Database['public']['Enums']['property_type'][];
          status: Database['public']['Enums']['project_status'];
          address: string | null;
          locality: string | null;
          city: string;
          district: string | null;
          state: string | null;
          pincode: string | null;
          latitude: number | null;
          longitude: number | null;
          map_url: string | null;
          total_area: number | null;
          total_area_unit: Database['public']['Enums']['area_unit'];
          /** Generated. */
          total_area_sqft: number | null;
          /** Declared from the brochure. Legitimately differs from units_total. */
          total_units: number | null;
          /** Trigger-maintained from project_units. */
          units_total: number;
          units_available: number;
          units_hold: number;
          units_booked: number;
          units_sold: number;
          units_blocked: number;
          /** The builder's stated range, never overwritten from the loaded inventory. */
          price_min: number | null;
          price_max: number | null;
          bedroom_options: number[];
          launch_date: string | null;
          expected_completion_date: string | null;
          actual_completion_date: string | null;
          construction_progress_percentage: number | null;
          construction_progress_note: string | null;
          last_progress_update: string | null;
          progress_updated_by: string | null;
          /** Do not render "Verified" unless this is 'admin_verified'. */
          progress_verification: Database['public']['Enums']['progress_verification_status'];
          rera_number: string | null;
          verification_status: Database['public']['Enums']['entity_verification_status'];
          /** Generated from verification_status. */
          is_verified: boolean;
          verified_at: string | null;
          admin_notes: string | null;
          is_featured: boolean;
          /** Whether the page is live. Distinct from `status`, which is construction. */
          is_published: boolean;
          published_at: string | null;
          cover_image_url: string | null;
          views_count: number;
          leads_count: number;
          created_at: string;
          updated_at: string;
        };
        /** Owner or admin of the organization, with a complete profile. */
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          /** Derived from name + locality + city when omitted. */
          slug?: string;
          project_code?: string | null;
          description?: string | null;
          project_type: Database['public']['Enums']['project_type'];
          property_types?: Database['public']['Enums']['property_type'][];
          status?: Database['public']['Enums']['project_status'];
          address?: string | null;
          locality?: string | null;
          city: string;
          district?: string | null;
          state?: string | null;
          pincode?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          /** Constrained to Google Maps hosts, as properties.map_url is. */
          map_url?: string | null;
          total_area?: number | null;
          total_area_unit?: Database['public']['Enums']['area_unit'];
          total_units?: number | null;
          price_min?: number | null;
          price_max?: number | null;
          bedroom_options?: number[];
          launch_date?: string | null;
          expected_completion_date?: string | null;
          actual_completion_date?: string | null;
          construction_progress_percentage?: number | null;
          construction_progress_note?: string | null;
          /** published_at is stamped by the guard when this first becomes true. */
          is_published?: boolean;
          rera_number?: string | null;
        };
        /**
         * Marketing role and above. The admin-managed columns
         * (verification_status, is_featured, progress_verification) and every
         * counter are absent because the guard trigger reverts them.
         */
        Update: Partial<Omit<Database['public']['Tables']['projects']['Insert'], 'id' | 'organization_id'>>;
        Relationships: [
          { foreignKeyName: 'projects_organization_id_fkey'; columns: ['organization_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'projects_created_by_fkey'; columns: ['created_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      properties: {
        Row: {
          id: string;
          seller_id: string;
          title: string;
          slug: string | null;
          description: string | null;
          property_type: Database['public']['Enums']['property_type'];
          listing_type: Database['public']['Enums']['listing_type'];
          price: number;
          is_negotiable: boolean;
          area: number | null;
          area_unit: Database['public']['Enums']['area_unit'];
          area_sqft: number | null;
          bedrooms: number | null;
          bathrooms: number | null;
          balconies: number | null;
          floor_number: number | null;
          total_floors: number | null;
          property_age: number | null;
          furnishing_status: Database['public']['Enums']['furnishing_status'] | null;
          parking: number;
          facing: Database['public']['Enums']['facing_direction'] | null;
          country: string;
          state: string | null;
          city: string;
          locality: string | null;
          pincode: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          /** The Google Maps link the seller gave; provenance only, never an iframe src. */
          map_url: string | null;
          /** Short URL identifier, 7 chars of Crockford base32. Assigned by trigger, immutable. */
          public_code: string;
          /** Self-reported at the moment of closing; NULL means never answered. */
          sold_via: string | null;
          /** Stamped by trigger when status becomes sold/rented; cleared if reopened. */
          closed_at: string | null;
          seller_type: Database['public']['Enums']['user_role'];
          /** Canonical YouTube/Vimeo URL; constrained by properties_video_url_check. */
          video_url: string | null;
          /** The admin who listed this on the seller's behalf; NULL if self-posted. */
          posted_by: string | null;
          /** Optional. Set when this listing is a unit in a project; NULL for every independent listing. */
          project_id: string | null;
          /** Optional. The company this was posted for; NULL when an owner posted it themselves. */
          organization_id: string | null;
          status: Database['public']['Enums']['property_status'];
          verification_status: Database['public']['Enums']['verification_status'];
          is_featured: boolean;
          rejection_reason: string | null;
          published_at: string | null;
          expires_at: string | null;
          last_renewed_at: string | null;
          cover_image_url: string | null;
          views_count: number;
          saves_count: number;
          unlocks_count: number;
          leads_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          title: string;
          description?: string | null;
          property_type: Database['public']['Enums']['property_type'];
          listing_type: Database['public']['Enums']['listing_type'];
          /** Declared per listing; constrained to owner | agent | builder. */
          seller_type?: Database['public']['Enums']['user_role'];
          price: number;
          is_negotiable?: boolean;
          area?: number | null;
          area_unit?: Database['public']['Enums']['area_unit'];
          bedrooms?: number | null;
          bathrooms?: number | null;
          balconies?: number | null;
          floor_number?: number | null;
          total_floors?: number | null;
          property_age?: number | null;
          furnishing_status?: Database['public']['Enums']['furnishing_status'] | null;
          parking?: number;
          facing?: Database['public']['Enums']['facing_direction'] | null;
          country?: string;
          state?: string | null;
          city: string;
          locality?: string | null;
          pincode?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          /** Constrained by properties_map_url_check to Google Maps hosts. */
          map_url?: string | null;
          /** Assigned by properties_set_public_code and immutable thereafter; never write it. */
          public_code?: never;
          /** Constrained by properties_sold_via_check; written only alongside a close. */
          sold_via?: '99estate' | 'other_platform' | 'offline' | 'not_said' | null;
          /** Stamped by properties_stamp_closed_at; never write it directly. */
          closed_at?: never;
          status?: Database['public']['Enums']['property_status'];
          /** Write only what lib/properties/video.ts canonicalises, or the CHECK rejects it. */
          video_url?: string | null;
          /** Admin-only; pinned to NULL for everyone else by properties_guard_posted_by. */
          posted_by?: string | null;
          /** Requires inventory rights on the project, or the link guard refuses it. */
          project_id?: string | null;
          /** Requires membership of that organization. */
          organization_id?: string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['properties']['Insert'], 'seller_id'>>;
        Relationships: [
          { foreignKeyName: 'properties_seller_id_fkey'; columns: ['seller_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'properties_project_id_fkey'; columns: ['project_id']; referencedRelation: 'projects'; referencedColumns: ['id'] },
          { foreignKeyName: 'properties_organization_id_fkey'; columns: ['organization_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
        ];
      };

      property_amenities: {
        Row: { id: string; property_id: string; amenity_name: string; created_at: string };
        Insert: { id?: string; property_id: string; amenity_name: string };
        Update: { amenity_name?: string };
        Relationships: [
          { foreignKeyName: 'property_amenities_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ];
      };

      property_categories: {
        Row: {
          id: string;
          slug: string;
          label: string;
          description: string | null;
          property_types: Database['public']['Enums']['property_type'][];
          listing_types: Database['public']['Enums']['listing_type'][];
          icon: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          description?: string | null;
          property_types?: Database['public']['Enums']['property_type'][];
          listing_types?: Database['public']['Enums']['listing_type'][];
          icon?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          slug?: string;
          label?: string;
          description?: string | null;
          property_types?: Database['public']['Enums']['property_type'][];
          listing_types?: Database['public']['Enums']['listing_type'][];
          icon?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };

      property_images: {
        Row: {
          id: string;
          property_id: string;
          storage_path: string;
          public_url: string;
          is_cover: boolean;
          sort_order: number;
          width: number | null;
          height: number | null;
          byte_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          storage_path: string;
          public_url: string;
          is_cover?: boolean;
          sort_order?: number;
          width?: number | null;
          height?: number | null;
          byte_size?: number | null;
        };
        Update: { is_cover?: boolean; sort_order?: number };
        Relationships: [
          { foreignKeyName: 'property_images_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ];
      };

      property_reports: {
        Row: {
          id: string;
          property_id: string;
          reporter_id: string;
          reason: Database['public']['Enums']['report_reason'];
          description: string | null;
          status: Database['public']['Enums']['report_status'];
          admin_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          property_id: string;
          reporter_id: string;
          reason: Database['public']['Enums']['report_reason'];
          description?: string | null;
        };
        Update: {
          status?: Database['public']['Enums']['report_status'];
          admin_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'property_reports_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ];
      };

      property_views: {
        Row: {
          id: string;
          property_id: string;
          viewer_id: string | null;
          visitor_hash: string;
          viewed_on: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'property_views_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ];
      };

      saved_properties: {
        Row: { id: string; user_id: string; property_id: string; created_at: string };
        Insert: { id?: string; user_id: string; property_id: string };
        Update: never;
        Relationships: [
          { foreignKeyName: 'saved_properties_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'saved_properties_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      verification_requests: {
        Row: {
          id: string;
          property_id: string;
          seller_id: string;
          documents: Json;
          note: string | null;
          status: Database['public']['Enums']['verification_status'];
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { property_id: string; seller_id?: string; documents?: Json; note?: string | null };
        Update: {
          status?: Database['public']['Enums']['verification_status'];
          admin_notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'verification_requests_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ];
      };
    };

    Views: {
      /** Non-sensitive seller fields. Contains no contact information. */
      seller_public_profiles: {
        Row: {
          id: string | null;
          full_name: string | null;
          avatar_url: string | null;
          seller_type: Database['public']['Enums']['user_role'] | null;
          member_since: string | null;
        };
        Relationships: [];
      };

      /** Seller phone numbers, visible only to a buyer holding a settled unlock. */
      unlocked_seller_contacts: {
        Row: {
          contact_unlock_id: string | null;
          property_id: string | null;
          buyer_id: string | null;
          seller_id: string | null;
          is_free: boolean | null;
          amount: number | null;
          currency: string | null;
          unlocked_at: string | null;
          seller_name: string | null;
          seller_mobile: string | null;
          seller_avatar: string | null;
          seller_type: Database['public']['Enums']['user_role'] | null;
        };
        Relationships: [];
      };

      /**
       * Lead inbox for a listing owner or an organization, including the buyer
       * contact they are entitled to. Already filtered to auth.uid() inside the
       * view, so no extra WHERE is needed — and none will widen it.
       */
      lead_details: {
        Row: {
          id: string | null;
          property_id: string | null;
          seller_id: string | null;
          buyer_id: string | null;
          contact_unlock_id: string | null;
          status: Database['public']['Enums']['lead_status'] | null;
          notes: string | null;
          last_status_change_at: string | null;
          created_at: string | null;
          updated_at: string | null;
          project_id: string | null;
          unit_id: string | null;
          organization_id: string | null;
          source: Database['public']['Enums']['lead_source'] | null;
          assigned_to: string | null;
          message: string | null;
          buyer_name: string | null;
          /**
           * The profile number when a settled unlock backs the lead, otherwise
           * only what the buyer typed into the enquiry form. Never both.
           */
          buyer_mobile: string | null;
          buyer_avatar: string | null;
          contact_display_name: string | null;
          property_title: string | null;
          property_slug: string | null;
          property_public_code: string | null;
          property_city: string | null;
          property_locality: string | null;
          property_price: number | null;
          listing_type: Database['public']['Enums']['listing_type'] | null;
          project_name: string | null;
          project_slug: string | null;
          project_city: string | null;
          project_locality: string | null;
          unit_number: string | null;
          unit_type: string | null;
          unit_price: number | null;
          organization_name: string | null;
          organization_slug: string | null;
          unlock_was_free: boolean | null;
          unlock_amount: number | null;
          unlocked_at: string | null;
        };
        Relationships: [];
      };

      /** Non-sensitive organization fields, safe for anonymous reads. No phone, email or GST. */
      builder_public_profiles: {
        Row: {
          id: string | null;
          name: string | null;
          slug: string | null;
          org_types: Database['public']['Enums']['organization_type'][] | null;
          logo_url: string | null;
          cover_image_url: string | null;
          about: string | null;
          established_year: number | null;
          city: string | null;
          state: string | null;
          locality: string | null;
          website: string | null;
          rera_number: string | null;
          verification_status: Database['public']['Enums']['entity_verification_status'] | null;
          is_verified: boolean | null;
          projects_count: number | null;
          member_since: string | null;
        };
        Relationships: [];
      };
    };

    Functions: {
      get_daily_contact_usage: {
        Args: { p_user_id?: string };
        Returns: {
          free_limit: number;
          free_used: number;
          free_remaining: number;
          paid_today: number;
          total_today: number;
          day_start: string;
          resets_at: string;
        }[];
      };
      get_contact_unlock_state: { Args: { p_property_id: string }; Returns: Json };
      request_contact_unlock: { Args: { p_property_id: string }; Returns: Json };
      create_contact_unlock_order: { Args: { p_property_id: string; p_provider: string }; Returns: Json };
      attach_payment_order: { Args: { p_payment_id: string; p_provider_order_id: string; p_metadata?: Json }; Returns: undefined };
      settle_paid_contact_unlock: { Args: { p_payment_id: string; p_provider_payment_id: string; p_metadata?: Json }; Returns: Json };
      fail_payment: { Args: { p_payment_id: string; p_reason: string; p_metadata?: Json }; Returns: undefined };
      record_property_view: { Args: { p_property_id: string; p_visitor_hash: string }; Returns: undefined };
      renew_property: { Args: { p_property_id: string }; Returns: Json };
      admin_approve_property: { Args: { p_property_id: string }; Returns: Json };
      admin_reject_property: { Args: { p_property_id: string; p_reason: string }; Returns: Json };
      admin_set_verification: {
        Args: { p_property_id: string; p_status: Database['public']['Enums']['verification_status']; p_notes?: string };
        Returns: Json;
      };
      admin_set_account_status: {
        Args: { p_user_id: string; p_status: Database['public']['Enums']['account_status'] };
        Returns: Json;
      };
      expire_stale_properties: { Args: Record<string, never>; Returns: number };
      notify_expiring_properties: { Args: { p_days_ahead?: number }; Returns: number };
      /** Admin or service role only; returns how many rows it removed. */
      prune_client_errors: { Args: { p_keep_days?: number }; Returns: number };
      is_admin: { Args: { p_uid?: string }; Returns: boolean };
      profile_is_complete: { Args: { p_uid?: string }; Returns: boolean };

      // ---- Organizations and projects ------------------------------------
      /**
       * The only way a project enquiry becomes a lead. Resolves the owning
       * organization server-side, notifies it, and is idempotent — pressing the
       * button twice updates the enquiry rather than filing a second one.
       */
      submit_project_enquiry: {
        Args: {
          p_project_id: string;
          p_unit_id?: string | null;
          p_contact_name?: string | null;
          p_contact_mobile?: string | null;
          p_message?: string | null;
        };
        Returns: Json;
      };
      /** Callable anonymously, as record_property_view is. */
      record_project_view: { Args: { p_project_id: string }; Returns: undefined };
      admin_verify_organization: {
        Args: {
          p_organization_id: string;
          p_status: Database['public']['Enums']['entity_verification_status'];
          p_notes?: string | null;
        };
        Returns: Json;
      };
      admin_verify_project: {
        Args: {
          p_project_id: string;
          p_status: Database['public']['Enums']['entity_verification_status'];
          p_notes?: string | null;
        };
        Returns: Json;
      };
      /** The only thing that can mark reported construction progress as verified. */
      admin_verify_project_progress: { Args: { p_project_id: string; p_verified?: boolean }; Returns: Json };
      /** NULL when the user is not an active member. */
      org_role_of: {
        Args: { p_org_id: string; p_uid?: string };
        Returns: Database['public']['Enums']['org_member_role'] | null;
      };
      is_org_member: { Args: { p_org_id: string; p_uid?: string }; Returns: boolean };
      /** Owner or admin: the team, the company profile, creating and deleting projects. */
      can_manage_org: { Args: { p_org_id: string; p_uid?: string }; Returns: boolean };
      /** The above plus sales manager: inventory and leads. */
      can_manage_org_inventory: { Args: { p_org_id: string; p_uid?: string }; Returns: boolean };
      /** The above plus marketing: the project record, its media and its amenities. */
      can_manage_org_marketing: { Args: { p_org_id: string; p_uid?: string }; Returns: boolean };
      /**
       * Turns every pending invitation addressed to the caller's verified email
       * into an active membership. Idempotent, and called on every sign-in.
       */
      accept_pending_invitations: { Args: Record<string, never>; Returns: Json };
    };

    Enums: {
      user_role: 'buyer' | 'owner' | 'agent' | 'builder' | 'admin';
      account_status: 'active' | 'suspended';
      property_type:
        | 'apartment'
        | 'independent_house'
        | 'villa'
        | 'builder_floor'
        | 'penthouse'
        | 'studio'
        | 'farmhouse'
        | 'residential_plot'
        | 'office_space'
        | 'co_working'
        | 'shop'
        | 'showroom'
        | 'warehouse'
        | 'industrial_land'
        | 'commercial_plot'
        | 'pg_hostel'
        | 'agricultural_land'
        | 'vacant_land'
        | 'farm_land'
        | 'investment_land';
      listing_type: 'sale' | 'rent' | 'pg';
      area_unit: 'sqft' | 'sqm' | 'sqyd' | 'acre' | 'hectare' | 'cent' | 'guntha' | 'bigha' | 'marla' | 'kanal';
      furnishing_status: 'unfurnished' | 'semi_furnished' | 'fully_furnished';
      facing_direction:
        | 'north'
        | 'south'
        | 'east'
        | 'west'
        | 'north_east'
        | 'north_west'
        | 'south_east'
        | 'south_west';
      property_status: 'draft' | 'pending' | 'published' | 'paused' | 'sold' | 'rented' | 'expired' | 'rejected';
      verification_status: 'unverified' | 'pending' | 'verified' | 'rejected';
      /**
       * Organizations and projects, NOT properties. A separate type from
       * `verification_status` on purpose: `suspended` must not become a legal
       * verification state for a listing, which nothing in the listing code
       * handles.
       */
      entity_verification_status: 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended';
      payment_status: 'created' | 'pending' | 'success' | 'failed' | 'refunded';
      lead_status: 'new' | 'contacted' | 'interested' | 'site_visit' | 'negotiation' | 'closed' | 'not_interested';
      /** How a lead came to exist. Only `contact_unlock` means ₹9 changed hands. */
      lead_source: 'contact_unlock' | 'project_enquiry' | 'unit_enquiry' | 'site_visit' | 'admin';
      report_reason:
        | 'fake_property'
        | 'duplicate'
        | 'wrong_price'
        | 'sold_property'
        | 'wrong_contact'
        | 'fraud'
        | 'spam'
        | 'misleading_information'
        | 'other';
      report_status: 'open' | 'under_review' | 'resolved' | 'dismissed';
      notification_type:
        | 'payment'
        | 'contact_unlock'
        | 'property_approved'
        | 'property_rejected'
        | 'new_lead'
        | 'property_expiry'
        | 'verification'
        | 'saved_property'
        | 'system';

      // ---- Organizations and projects ------------------------------------
      /** One company can be several of these at once; `org_types` is an array. */
      organization_type:
        | 'owner'
        | 'agent'
        | 'broker'
        | 'builder'
        | 'promoter'
        | 'developer'
        | 'real_estate_company';
      org_member_role: 'owner' | 'admin' | 'sales_manager' | 'sales_executive' | 'marketing' | 'viewer';
      org_member_status: 'invited' | 'active' | 'suspended';
      org_invitation_status: 'pending' | 'accepted' | 'revoked';
      project_type: 'apartment' | 'villa' | 'independent_house' | 'plot' | 'commercial' | 'mixed_development';
      /** Where construction has got to. Independent of unit status and of is_published. */
      project_status:
        | 'upcoming'
        | 'pre_launch'
        | 'new_launch'
        | 'under_construction'
        | 'near_completion'
        | 'ready_to_move'
        | 'completed'
        | 'sold_out';
      unit_status: 'available' | 'hold' | 'booked' | 'sold' | 'blocked';
      project_media_type:
        | 'cover'
        | 'gallery'
        | 'floor_plan'
        | 'master_plan'
        | 'brochure'
        | 'video'
        | 'construction_update'
        | 'other';
      /** Never print "Verified" for `promoter_reported` — only an admin RPC sets the other. */
      progress_verification_status: 'promoter_reported' | 'admin_verified';
      building_status: 'planned' | 'under_construction' | 'completed' | 'sold_out';
    };

    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Convenience aliases used across the app
// ---------------------------------------------------------------------------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
