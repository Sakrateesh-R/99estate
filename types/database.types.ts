/**
 * Typed contract for the 99Estate Postgres schema.
 *
 * Mirrors `supabase/migrations/*`. Regenerate against a live database with:
 *
 *   npm run db:types        # supabase gen types typescript --local
 *
 * Generated columns (`is_profile_complete`, `area_sqft`, `search_vector`) are
 * present on Row but absent from Insert/Update — the database computes them
 * and refuses to be told otherwise.
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

      leads: {
        Row: {
          id: string;
          property_id: string;
          seller_id: string;
          buyer_id: string;
          contact_unlock_id: string;
          status: Database['public']['Enums']['lead_status'];
          notes: string | null;
          last_status_change_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          status?: Database['public']['Enums']['lead_status'];
          notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'leads_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'leads_buyer_id_fkey'; columns: ['buyer_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
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
          seller_type: Database['public']['Enums']['user_role'];
          /** Canonical YouTube/Vimeo URL; constrained by properties_video_url_check. */
          video_url: string | null;
          /** The admin who listed this on the seller's behalf; NULL if self-posted. */
          posted_by: string | null;
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
          status?: Database['public']['Enums']['property_status'];
          /** Write only what lib/properties/video.ts canonicalises, or the CHECK rejects it. */
          video_url?: string | null;
          /** Admin-only; pinned to NULL for everyone else by properties_guard_posted_by. */
          posted_by?: string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['properties']['Insert'], 'seller_id'>>;
        Relationships: [
          { foreignKeyName: 'properties_seller_id_fkey'; columns: ['seller_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
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

      /** Lead inbox for the listing owner, including the buyer contact earned. */
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
          buyer_name: string | null;
          buyer_mobile: string | null;
          buyer_avatar: string | null;
          property_title: string | null;
          property_slug: string | null;
          property_city: string | null;
          property_locality: string | null;
          property_price: number | null;
          listing_type: Database['public']['Enums']['listing_type'] | null;
          unlock_was_free: boolean | null;
          unlock_amount: number | null;
          unlocked_at: string | null;
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
      is_admin: { Args: { p_uid?: string }; Returns: boolean };
      profile_is_complete: { Args: { p_uid?: string }; Returns: boolean };
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
        | 'agricultural_land';
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
      payment_status: 'created' | 'pending' | 'success' | 'failed' | 'refunded';
      lead_status: 'new' | 'contacted' | 'interested' | 'site_visit' | 'negotiation' | 'closed' | 'not_interested';
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
