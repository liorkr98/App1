// GENERATED FILE — do not edit by hand.
//
// Regenerate after every migration, either with the Supabase MCP
// (generate_typescript_types) or:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
//
// PROVENANCE OF THIS PARTICULAR REGENERATION (12 September 2026): written by
// hand from supabase/migrations/0001…0011, NOT introspected from the live
// project — this session had no authorised Supabase connection to run the
// generator against. docs/OPPORTUNITIES.md §5 flagged the previous version
// of this file as stale at 0001 (profiles only) while migrations had reached
// 0011; that gap is closed here, but "read from the SQL" is a weaker
// guarantee than "read from the database" and this file should still be
// regenerated for real the next time a Supabase connection is available,
// to catch anything the SQL implies that a hand reading missed.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          error_code: string | null;
          id: string;
          input_hash: string;
          job_type: Database['public']['Enums']['job_type'];
          listing_id: string;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          next_attempt_at: string;
          payload: Json;
          progress: number;
          result: Json | null;
          scope_key: string | null;
          scope_label: string | null;
          status: Database['public']['Enums']['job_status'];
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          input_hash: string;
          job_type: Database['public']['Enums']['job_type'];
          listing_id: string;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          payload?: Json;
          progress?: number;
          result?: Json | null;
          scope_key?: string | null;
          scope_label?: string | null;
          status?: Database['public']['Enums']['job_status'];
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          input_hash?: string;
          job_type?: Database['public']['Enums']['job_type'];
          listing_id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          payload?: Json;
          progress?: number;
          result?: Json | null;
          scope_key?: string | null;
          scope_label?: string | null;
          status?: Database['public']['Enums']['job_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_enrichment: {
        Row: {
          computed_at: string;
          // geography(Point, 4326) — PostGIS has no clean JSON mapping, and
          // the page never reads this column directly (it reads `payload`).
          geom: unknown;
          listing_id: string;
          payload: Json;
        };
        Insert: {
          computed_at?: string;
          geom: unknown;
          listing_id: string;
          payload: Json;
        };
        Update: {
          computed_at?: string;
          geom?: unknown;
          listing_id?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_enrichment_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: true;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listings: {
        Row: {
          accent: string;
          audience: string;
          category: string;
          created_at: string;
          currency: string;
          description: string;
          disclosures: string[] | null;
          expires_at: string | null;
          facts: Json;
          id: string;
          indexable: boolean;
          list_price: number | null;
          location: Json | null;
          media: Json;
          og_image_hash: string | null;
          // References auth.users, a schema this generation was not run
          // against — see the Relationships note on `profiles.id` below.
          owner_id: string;
          price: number;
          price_note: string | null;
          published_at: string | null;
          seller: Json;
          slug: string;
          status: string;
          template: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          accent?: string;
          audience?: string;
          category: string;
          created_at?: string;
          currency?: string;
          description?: string;
          disclosures?: string[] | null;
          expires_at?: string | null;
          facts?: Json;
          id?: string;
          indexable?: boolean;
          list_price?: number | null;
          location?: Json | null;
          media?: Json;
          og_image_hash?: string | null;
          owner_id: string;
          price: number;
          price_note?: string | null;
          published_at?: string | null;
          seller?: Json;
          slug: string;
          status?: string;
          template?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          accent?: string;
          audience?: string;
          category?: string;
          created_at?: string;
          currency?: string;
          description?: string;
          disclosures?: string[] | null;
          expires_at?: string | null;
          facts?: Json;
          id?: string;
          indexable?: boolean;
          list_price?: number | null;
          location?: Json | null;
          media?: Json;
          og_image_hash?: string | null;
          owner_id?: string;
          price?: number;
          price_note?: string | null;
          published_at?: string | null;
          seller?: Json;
          slug?: string;
          status?: string;
          template?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      places: {
        Row: {
          category: string;
          geom: unknown;
          name: string;
          osm_id: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          geom: unknown;
          name: string;
          osm_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          geom?: unknown;
          name?: string;
          osm_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          accent: string;
          agency_logo_url: string | null;
          agency_name: string | null;
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          // References auth.users(id). Cross-schema relationships are not
          // included here — this generation only introspected `public`.
          id: string;
          licence_number: string | null;
          locale: string;
          phone: string | null;
          role: string | null;
          updated_at: string;
        };
        Insert: {
          accent?: string;
          agency_logo_url?: string | null;
          agency_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          licence_number?: string | null;
          locale?: string;
          phone?: string | null;
          role?: string | null;
          updated_at?: string;
        };
        Update: {
          accent?: string;
          agency_logo_url?: string | null;
          agency_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          licence_number?: string | null;
          locale?: string;
          phone?: string | null;
          role?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      schools: {
        Row: {
          geom: unknown;
          grade_from: string | null;
          grade_to: string | null;
          locality: string | null;
          location_accuracy: string | null;
          name: string;
          semel_mosad: string;
          stream: string | null;
          type: string | null;
          updated_at: string;
        };
        Insert: {
          geom: unknown;
          grade_from?: string | null;
          grade_to?: string | null;
          locality?: string | null;
          location_accuracy?: string | null;
          name: string;
          semel_mosad: string;
          stream?: string | null;
          type?: string | null;
          updated_at?: string;
        };
        Update: {
          geom?: unknown;
          grade_from?: string | null;
          grade_to?: string | null;
          locality?: string | null;
          location_accuracy?: string | null;
          name?: string;
          semel_mosad?: string;
          stream?: string | null;
          type?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      source_sync: {
        Row: {
          attribution: string | null;
          display_name: string;
          last_attempted_at: string | null;
          last_error: string | null;
          last_synced_at: string | null;
          row_count: number;
          source: string;
        };
        Insert: {
          attribution?: string | null;
          display_name: string;
          last_attempted_at?: string | null;
          last_error?: string | null;
          last_synced_at?: string | null;
          row_count?: number;
          source: string;
        };
        Update: {
          attribution?: string | null;
          display_name?: string;
          last_attempted_at?: string | null;
          last_error?: string | null;
          last_synced_at?: string | null;
          row_count?: number;
          source?: string;
        };
        Relationships: [];
      };
      transit_stops: {
        Row: {
          geom: unknown;
          mode: string;
          name: string;
          routes: string[];
          stop_id: string;
          updated_at: string;
        };
        Insert: {
          geom: unknown;
          mode: string;
          name: string;
          routes?: string[];
          stop_id: string;
          updated_at?: string;
        };
        Update: {
          geom?: unknown;
          mode?: string;
          name?: string;
          routes?: string[];
          stop_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // security_invoker — a row is visible only through the reader's own
      // RLS on `jobs`, exactly as if they queried it directly (0003).
      listing_processing: {
        Row: {
          done: number | null;
          failed: number | null;
          failed_scopes: string[] | null;
          has_global_failure: boolean | null;
          listing_id: string | null;
          pending: number | null;
          progress: number | null;
          total: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      attach_pdf: {
        Args: {
          p_listing_id: string;
          p_url: string;
        };
        Returns: undefined;
      };
      claim_job: {
        Args: {
          p_job_types: Database['public']['Enums']['job_type'][];
          p_locked_by: string;
          // interval — passed as a Postgres interval literal string, e.g.
          // '5 minutes'. No clean JS mapping, hence unknown.
          p_stale_after: unknown;
        };
        Returns: {
          attempts: number;
          created_at: string;
          error_code: string | null;
          id: string;
          input_hash: string;
          job_type: Database['public']['Enums']['job_type'];
          listing_id: string;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          next_attempt_at: string;
          payload: Json;
          progress: number;
          result: Json | null;
          scope_key: string | null;
          scope_label: string | null;
          status: Database['public']['Enums']['job_status'];
          updated_at: string;
        };
      };
      enqueue_job: {
        Args: {
          p_listing_id: string;
          p_job_type: Database['public']['Enums']['job_type'];
          p_input_hash: string;
          p_scope_key?: string | null;
          p_scope_label?: string | null;
          p_payload?: Json;
        };
        Returns: string;
      };
      nearby_candidates: {
        Args: {
          p_lat: number;
          p_lon: number;
          p_radius_metres?: number;
          p_limit_per_kind?: number;
        };
        Returns: {
          kind: string;
          id: string;
          name: string;
          lon: number;
          lat: number;
          // Straight-line only, for candidate ordering. NEVER displayed —
          // see the function's own comment in 0008_nearby.sql.
          metres: number;
          attr_a: string | null;
          attr_b: string | null;
          attr_c: string | null;
        }[];
      };
    };
    Enums: {
      job_status: 'queued' | 'processing' | 'done' | 'failed';
      job_type:
        | 'enhance_images'
        | 'stitch_panorama'
        | 'extract_frames'
        | 'build_sprite'
        | 'generate_og'
        | 'render_pdf';
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type Profile = Tables<'profiles'>;
export type ListingRow = Tables<'listings'>;
export type JobRow = Tables<'jobs'>;
export type SchoolRow = Tables<'schools'>;
export type PlaceRow = Tables<'places'>;
export type TransitStopRow = Tables<'transit_stops'>;
export type SourceSyncRow = Tables<'source_sync'>;
export type ListingEnrichmentRow = Tables<'listing_enrichment'>;
