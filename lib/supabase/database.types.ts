export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_club_assignments: {
        Row: {
          admin_profile_id: string
          club_id: string | null
          created_at: string
          id: string
          segment_id: string | null
        }
        Insert: {
          admin_profile_id: string
          club_id?: string | null
          created_at?: string
          id?: string
          segment_id?: string | null
        }
        Update: {
          admin_profile_id?: string
          club_id?: string | null
          created_at?: string
          id?: string
          segment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_club_assignments_admin_profile_id_fkey"
            columns: ["admin_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_club_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_club_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_club_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_club_assignments_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      allergies: {
        Row: {
          code: string
          created_at: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          author: string | null
          body: string | null
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          is_published: boolean
          published_at: string | null
          title: string
        }
        Insert: {
          author?: string | null
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string | null
          title: string
        }
        Update: {
          author?: string | null
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string | null
          title?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          athlete_id: string
          bmr: number | null
          body_fat_pct: number | null
          created_at: string
          date: string
          height_cm: number | null
          id: string
          lean_mass_kg: number | null
          method: string
          method_data: Json
          muscle_mass_kg: number | null
          notes: string | null
          provider_id: string
          tdee: number | null
          updated_at: string | null
          updated_by: string | null
          validity_tier: string
          visceral_fat: number | null
          weight_kg: number | null
        }
        Insert: {
          athlete_id: string
          bmr?: number | null
          body_fat_pct?: number | null
          created_at?: string
          date: string
          height_cm?: number | null
          id?: string
          lean_mass_kg?: number | null
          method?: string
          method_data?: Json
          muscle_mass_kg?: number | null
          notes?: string | null
          provider_id: string
          tdee?: number | null
          updated_at?: string | null
          updated_by?: string | null
          validity_tier: string
          visceral_fat?: number | null
          weight_kg?: number | null
        }
        Update: {
          athlete_id?: string
          bmr?: number | null
          body_fat_pct?: number | null
          created_at?: string
          date?: string
          height_cm?: number | null
          id?: string
          lean_mass_kg?: number | null
          method?: string
          method_data?: Json
          muscle_mass_kg?: number | null
          notes?: string | null
          provider_id?: string
          tdee?: number | null
          updated_at?: string | null
          updated_by?: string | null
          validity_tier?: string
          visceral_fat?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_allergies: {
        Row: {
          allergy_code: string
          athlete_id: string
          created_at: string
          id: string
          other_note: string | null
        }
        Insert: {
          allergy_code: string
          athlete_id: string
          created_at?: string
          id?: string
          other_note?: string | null
        }
        Update: {
          allergy_code?: string
          athlete_id?: string
          created_at?: string
          id?: string
          other_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_allergies_allergy_code_fkey"
            columns: ["allergy_code"]
            isOneToOne: false
            referencedRelation: "allergies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "athlete_allergies_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_conditions: {
        Row: {
          athlete_id: string
          condition_code: string
          created_at: string
          id: string
          other_note: string | null
        }
        Insert: {
          athlete_id: string
          condition_code: string
          created_at?: string
          id?: string
          other_note?: string | null
        }
        Update: {
          athlete_id?: string
          condition_code?: string
          created_at?: string
          id?: string
          other_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_conditions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_conditions_condition_code_fkey"
            columns: ["condition_code"]
            isOneToOne: false
            referencedRelation: "medical_conditions"
            referencedColumns: ["code"]
          },
        ]
      }
      athlete_intolerances: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          intolerance_code: string
          other_note: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          intolerance_code: string
          other_note?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          intolerance_code?: string
          other_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_intolerances_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_intolerances_intolerance_code_fkey"
            columns: ["intolerance_code"]
            isOneToOne: false
            referencedRelation: "intolerances"
            referencedColumns: ["code"]
          },
        ]
      }
      athlete_relationship_history: {
        Row: {
          athlete_id: string
          club_id: string | null
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          practitioner_id: string | null
          reason: string | null
          relationship_type: string
          team_id: string | null
        }
        Insert: {
          athlete_id: string
          club_id?: string | null
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          practitioner_id?: string | null
          reason?: string | null
          relationship_type: string
          team_id?: string | null
        }
        Update: {
          athlete_id?: string
          club_id?: string | null
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          practitioner_id?: string | null
          reason?: string | null
          relationship_type?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_relationship_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_relationship_history_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_relationship_history_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_relationship_history_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_relationship_history_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_relationship_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_teams: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          team_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          team_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_teams_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          avg_cycle_length_days: number | null
          body_fat_pct: number | null
          club_id: string | null
          code: string
          country: string | null
          created_at: string
          diet_preference: string | null
          dob: string | null
          ethnicity: string | null
          first_name: string
          gender: string | null
          goal_body_fat_pct: number | null
          goal_lean_mass_kg: number | null
          height_cm: number | null
          id: string
          iron_status: string | null
          is_subscribed: boolean
          last_name: string
          last_period_start_date: string | null
          lean_mass_kg: number | null
          menstrual_status: string | null
          period_duration_days: number | null
          position: string | null
          profile_id: string | null
          profile_photo_url: string | null
          segment_id: string | null
          sport: string
          status: string
          tier: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          avg_cycle_length_days?: number | null
          body_fat_pct?: number | null
          club_id?: string | null
          code: string
          country?: string | null
          created_at?: string
          diet_preference?: string | null
          dob?: string | null
          ethnicity?: string | null
          first_name: string
          gender?: string | null
          goal_body_fat_pct?: number | null
          goal_lean_mass_kg?: number | null
          height_cm?: number | null
          id?: string
          iron_status?: string | null
          is_subscribed?: boolean
          last_name: string
          last_period_start_date?: string | null
          lean_mass_kg?: number | null
          menstrual_status?: string | null
          period_duration_days?: number | null
          position?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          segment_id?: string | null
          sport: string
          status?: string
          tier?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          avg_cycle_length_days?: number | null
          body_fat_pct?: number | null
          club_id?: string | null
          code?: string
          country?: string | null
          created_at?: string
          diet_preference?: string | null
          dob?: string | null
          ethnicity?: string | null
          first_name?: string
          gender?: string | null
          goal_body_fat_pct?: number | null
          goal_lean_mass_kg?: number | null
          height_cm?: number | null
          id?: string
          iron_status?: string | null
          is_subscribed?: boolean
          last_name?: string
          last_period_start_date?: string | null
          lean_mass_kg?: number | null
          menstrual_status?: string | null
          period_duration_days?: number | null
          position?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          segment_id?: string | null
          sport?: string
          status?: string
          tier?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          athlete_id: string | null
          created_at: string
          details_json: Json | null
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          athlete_id?: string | null
          created_at?: string
          details_json?: Json | null
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          athlete_id?: string | null
          created_at?: string
          details_json?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_partners: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_partners_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_partners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          contact_email: string | null
          created_at: string
          external_store_url: string | null
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          external_store_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          external_store_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          athlete_id: string
          compliance_score: number | null
          created_at: string
          date: string
          energy_level: number | null
          hydration_score: number | null
          id: string
          logged_by: string
          notes: string | null
          nutrition_score: string | null
          nutrition_value: number | null
          sleep_score: number | null
          status: string
          supplements_taken: string | null
        }
        Insert: {
          athlete_id: string
          compliance_score?: number | null
          created_at?: string
          date: string
          energy_level?: number | null
          hydration_score?: number | null
          id?: string
          logged_by: string
          notes?: string | null
          nutrition_score?: string | null
          nutrition_value?: number | null
          sleep_score?: number | null
          status?: string
          supplements_taken?: string | null
        }
        Update: {
          athlete_id?: string
          compliance_score?: number | null
          created_at?: string
          date?: string
          energy_level?: number | null
          hydration_score?: number | null
          id?: string
          logged_by?: string
          notes?: string | null
          nutrition_score?: string | null
          nutrition_value?: number | null
          sleep_score?: number | null
          status?: string
          supplements_taken?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_research_library: {
        Row: {
          clinical_note: string | null
          created_at: string
          created_by: string | null
          id: string
          source: string | null
          title: string
          topic_tag: string
          year: number | null
        }
        Insert: {
          clinical_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string | null
          title: string
          topic_tag: string
          year?: number | null
        }
        Update: {
          clinical_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string | null
          title?: string
          topic_tag?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_research_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_brand_products: {
        Row: {
          brand_id: string
          club_id: string | null
          created_at: string
          discount_code: string | null
          discount_percent: number
          id: string
          is_prescription_brand: boolean
          payment_mode: string
          segment_id: string | null
          show_in_shop: boolean
        }
        Insert: {
          brand_id: string
          club_id?: string | null
          created_at?: string
          discount_code?: string | null
          discount_percent?: number
          id?: string
          is_prescription_brand?: boolean
          payment_mode?: string
          segment_id?: string | null
          show_in_shop?: boolean
        }
        Update: {
          brand_id?: string
          club_id?: string | null
          created_at?: string
          discount_code?: string | null
          discount_percent?: number
          id?: string
          is_prescription_brand?: boolean
          payment_mode?: string
          segment_id?: string | null
          show_in_shop?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "club_brand_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_brand_products_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_brand_products_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_brand_products_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_brand_products_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      club_branding: {
        Row: {
          additional_instructions_guardrails: string | null
          advertising_banner_url: string | null
          arabic_format_notes: string | null
          club_id: string
          created_at: string
          id: string
          logo_url: string | null
          managed_by: string | null
          report_color_hex: string | null
          report_structure_rules: string | null
          updated_at: string | null
        }
        Insert: {
          additional_instructions_guardrails?: string | null
          advertising_banner_url?: string | null
          arabic_format_notes?: string | null
          club_id: string
          created_at?: string
          id?: string
          logo_url?: string | null
          managed_by?: string | null
          report_color_hex?: string | null
          report_structure_rules?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_instructions_guardrails?: string | null
          advertising_banner_url?: string | null
          arabic_format_notes?: string | null
          club_id?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          managed_by?: string | null
          report_color_hex?: string | null
          report_structure_rules?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_branding_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_branding_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_branding_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_branding_managed_by_fkey"
            columns: ["managed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_notify_recipients: {
        Row: {
          club_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_notify_recipients_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_notify_recipients_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_notify_recipients_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_notify_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_settings: {
        Row: {
          club_id: string
          compliance_notify_days: number
          created_at: string
          default_report_language: string
          id: string
          managed_by: string | null
          monthly_skip_limit: number
          updated_at: string | null
        }
        Insert: {
          club_id: string
          compliance_notify_days?: number
          created_at?: string
          default_report_language?: string
          id?: string
          managed_by?: string | null
          monthly_skip_limit?: number
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          compliance_notify_days?: number
          created_at?: string
          default_report_language?: string
          id?: string
          managed_by?: string | null
          monthly_skip_limit?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_settings_managed_by_fkey"
            columns: ["managed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_staff: {
        Row: {
          club_id: string
          created_at: string
          id: string
          profile_id: string
          staff_role: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          profile_id: string
          staff_role: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          staff_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_staff_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_staff_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_staff_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          sport: string
          stopped_by_super_admin: boolean
          subscription_end: string | null
          subscription_start: string | null
          subscription_status: string
          timezone: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          sport: string
          stopped_by_super_admin?: boolean
          subscription_end?: string | null
          subscription_start?: string | null
          subscription_status?: string
          timezone?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          sport?: string
          stopped_by_super_admin?: boolean
          subscription_end?: string | null
          subscription_start?: string | null
          subscription_status?: string
          timezone?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          ai_reflection_disabled_by: string | null
          athlete_id: string | null
          author_id: string
          body: string
          comment_type: string
          created_at: string
          id: string
          reflect_in_ai: boolean
          team_id: string | null
        }
        Insert: {
          ai_reflection_disabled_by?: string | null
          athlete_id?: string | null
          author_id: string
          body: string
          comment_type: string
          created_at?: string
          id?: string
          reflect_in_ai?: boolean
          team_id?: string | null
        }
        Update: {
          ai_reflection_disabled_by?: string | null
          athlete_id?: string | null
          author_id?: string
          body?: string
          comment_type?: string
          created_at?: string
          id?: string
          reflect_in_ai?: boolean
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_ai_reflection_disabled_by_fkey"
            columns: ["ai_reflection_disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_home: boolean | null
          location: string | null
          notes: string | null
          opponent: string | null
          team_id: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_home?: boolean | null
          location?: string | null
          notes?: string | null
          opponent?: string | null
          team_id?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_home?: boolean | null
          location?: string | null
          notes?: string | null
          opponent?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          published_at: string | null
          target_athlete_id: string | null
          target_club_id: string | null
          target_segment_id: string | null
          target_type: string
          title: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          published_at?: string | null
          target_athlete_id?: string | null
          target_club_id?: string | null
          target_segment_id?: string | null
          target_type?: string
          title: string
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          published_at?: string | null
          target_athlete_id?: string | null
          target_club_id?: string | null
          target_segment_id?: string | null
          target_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_target_athlete_id_fkey"
            columns: ["target_athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_target_club_id_fkey"
            columns: ["target_club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_target_club_id_fkey"
            columns: ["target_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_target_club_id_fkey"
            columns: ["target_club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_target_segment_id_fkey"
            columns: ["target_segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      elite_benchmarks: {
        Row: {
          age_band: string
          age_max: number | null
          age_min: number | null
          body_fat_pct: number | null
          created_at: string
          gender: string
          id: string
          kcal_per_kg_lean_mass: number | null
          lean_mass_ratio: number | null
          source_note: string | null
          sport: string
        }
        Insert: {
          age_band: string
          age_max?: number | null
          age_min?: number | null
          body_fat_pct?: number | null
          created_at?: string
          gender: string
          id?: string
          kcal_per_kg_lean_mass?: number | null
          lean_mass_ratio?: number | null
          source_note?: string | null
          sport: string
        }
        Update: {
          age_band?: string
          age_max?: number | null
          age_min?: number | null
          body_fat_pct?: number | null
          created_at?: string
          gender?: string
          id?: string
          kcal_per_kg_lean_mass?: number | null
          lean_mass_ratio?: number | null
          source_note?: string | null
          sport?: string
        }
        Relationships: []
      }
      gps_logs: {
        Row: {
          accel_count: number | null
          athlete_id: string
          created_at: string
          date: string
          decel_count: number | null
          explosive_efforts: number | null
          high_speed_distance_m: number | null
          id: string
          max_velocity: number | null
          meters_per_min: number | null
          player_load: number | null
          provider_id: string
          session_duration_min: number | null
          sprint_count: number | null
          sprint_distance_m: number | null
          team_id: string | null
          total_distance_m: number | null
          updated_at: string | null
          updated_by: string | null
          validity_tier: string
        }
        Insert: {
          accel_count?: number | null
          athlete_id: string
          created_at?: string
          date: string
          decel_count?: number | null
          explosive_efforts?: number | null
          high_speed_distance_m?: number | null
          id?: string
          max_velocity?: number | null
          meters_per_min?: number | null
          player_load?: number | null
          provider_id: string
          session_duration_min?: number | null
          sprint_count?: number | null
          sprint_distance_m?: number | null
          team_id?: string | null
          total_distance_m?: number | null
          updated_at?: string | null
          updated_by?: string | null
          validity_tier: string
        }
        Update: {
          accel_count?: number | null
          athlete_id?: string
          created_at?: string
          date?: string
          decel_count?: number | null
          explosive_efforts?: number | null
          high_speed_distance_m?: number | null
          id?: string
          max_velocity?: number | null
          meters_per_min?: number | null
          player_load?: number | null
          provider_id?: string
          session_duration_min?: number | null
          sprint_count?: number | null
          sprint_distance_m?: number | null
          team_id?: string | null
          total_distance_m?: number | null
          updated_at?: string | null
          updated_by?: string | null
          validity_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_logs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      injuries: {
        Row: {
          athlete_id: string
          cleared_date: string | null
          created_at: string
          date: string
          description: string | null
          id: string
          provider_id: string
          rtp_phase: string | null
          status: string
          target_return_date: string | null
          type: string
          updated_at: string | null
          updated_by: string | null
          validity_tier: string
        }
        Insert: {
          athlete_id: string
          cleared_date?: string | null
          created_at?: string
          date: string
          description?: string | null
          id?: string
          provider_id: string
          rtp_phase?: string | null
          status?: string
          target_return_date?: string | null
          type: string
          updated_at?: string | null
          updated_by?: string | null
          validity_tier: string
        }
        Update: {
          athlete_id?: string
          cleared_date?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          provider_id?: string
          rtp_phase?: string | null
          status?: string
          target_return_date?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
          validity_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "injuries_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "injuries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intolerances: {
        Row: {
          code: string
          created_at: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          club_name: string | null
          contract_sent: boolean
          contract_signed: boolean
          country: string | null
          created_at: string
          email: string | null
          id: string
          meeting_booked: boolean
          meeting_date: string | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          sport: string | null
          squad_size: string | null
          status: string
        }
        Insert: {
          club_name?: string | null
          contract_sent?: boolean
          contract_signed?: boolean
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          meeting_booked?: boolean
          meeting_date?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          sport?: string | null
          squad_size?: string | null
          status?: string
        }
        Update: {
          club_name?: string | null
          contract_sent?: boolean
          contract_signed?: boolean
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          meeting_booked?: boolean
          meeting_date?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          sport?: string | null
          squad_size?: string | null
          status?: string
        }
        Relationships: []
      }
      medical_conditions: {
        Row: {
          code: string
          created_at: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      message_recipients: {
        Row: {
          id: string
          message_id: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_recipients_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          profile_id: string
          related_id: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          profile_id: string
          related_id?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          profile_id?: string
          related_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partnerships_consultant_clubs: {
        Row: {
          club_id: string
          commission_percent: number | null
          consultant_id: string
          created_at: string
          deal_value: number | null
          id: string
          stage: string | null
        }
        Insert: {
          club_id: string
          commission_percent?: number | null
          consultant_id: string
          created_at?: string
          deal_value?: number | null
          id?: string
          stage?: string | null
        }
        Update: {
          club_id?: string
          commission_percent?: number | null
          consultant_id?: string
          created_at?: string
          deal_value?: number | null
          id?: string
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partnerships_consultant_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnerships_consultant_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnerships_consultant_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnerships_consultant_clubs_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "partnerships_consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      partnerships_consultants: {
        Row: {
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partnerships_consultants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          applies_to: string
          billing_period: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          price: number
        }
        Insert: {
          applies_to: string
          billing_period?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
        }
        Update: {
          applies_to?: string
          billing_period?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
        }
        Relationships: []
      }
      practitioner_athletes: {
        Row: {
          approval_status: string
          approved_by: string | null
          athlete_id: string
          created_at: string
          decided_at: string | null
          ended_at: string | null
          id: string
          practitioner_id: string
          requested_at: string
        }
        Insert: {
          approval_status?: string
          approved_by?: string | null
          athlete_id: string
          created_at?: string
          decided_at?: string | null
          ended_at?: string | null
          id?: string
          practitioner_id: string
          requested_at?: string
        }
        Update: {
          approval_status?: string
          approved_by?: string | null
          athlete_id?: string
          created_at?: string
          decided_at?: string | null
          ended_at?: string | null
          id?: string
          practitioner_id?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_athletes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_athletes_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_requests: {
        Row: {
          athlete_id: string | null
          base_price: number | null
          club_id: string | null
          created_at: string
          discount_applied: number | null
          final_price: number | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          payment_method: string
          product_id: string
          status: string
        }
        Insert: {
          athlete_id?: string | null
          base_price?: number | null
          club_id?: string | null
          created_at?: string
          discount_applied?: number | null
          final_price?: number | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          payment_method?: string
          product_id: string
          status?: string
        }
        Update: {
          athlete_id?: string | null
          base_price?: number | null
          club_id?: string | null
          created_at?: string
          discount_applied?: number | null
          final_price?: number | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          payment_method?: string
          product_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_requests_athlete_fk"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allergens: string[]
          base_price: number | null
          brand_id: string
          category: string | null
          created_at: string
          currency: string
          default_dosing: string | null
          default_timing: string | null
          description: string | null
          dosing_unit: string | null
          id: string
          image_url: string | null
          informed_sport: boolean
          name: string
          nsf_certified: boolean
          supplement_library_id: string | null
          timing_notes: string[]
          vegan: boolean
        }
        Insert: {
          allergens?: string[]
          base_price?: number | null
          brand_id: string
          category?: string | null
          created_at?: string
          currency?: string
          default_dosing?: string | null
          default_timing?: string | null
          description?: string | null
          dosing_unit?: string | null
          id?: string
          image_url?: string | null
          informed_sport?: boolean
          name: string
          nsf_certified?: boolean
          supplement_library_id?: string | null
          timing_notes?: string[]
          vegan?: boolean
        }
        Update: {
          allergens?: string[]
          base_price?: number | null
          brand_id?: string
          category?: string | null
          created_at?: string
          currency?: string
          default_dosing?: string | null
          default_timing?: string | null
          description?: string | null
          dosing_unit?: string | null
          id?: string
          image_url?: string | null
          informed_sport?: boolean
          name?: string
          nsf_certified?: boolean
          supplement_library_id?: string | null
          timing_notes?: string[]
          vegan?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplement_library_id_fkey"
            columns: ["supplement_library_id"]
            isOneToOne: false
            referencedRelation: "supplement_library"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          role: string
          specialty: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          role: string
          specialty?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: string
          specialty?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          additional_instructions: string | null
          ai_summary: string | null
          athlete_ids: string[]
          audience: string
          created_at: string
          file_url: string | null
          flagged_by: string | null
          flagged_for_review: boolean
          flagged_note: string | null
          generated_by: string
          id: string
          is_official: boolean
          language: string
          render_fallback_reason: string | null
          renderer: string | null
          report_period_end: string | null
          report_period_start: string | null
          report_types: string[]
          shared_with: string[]
          team_id: string | null
        }
        Insert: {
          additional_instructions?: string | null
          ai_summary?: string | null
          athlete_ids: string[]
          audience: string
          created_at?: string
          file_url?: string | null
          flagged_by?: string | null
          flagged_for_review?: boolean
          flagged_note?: string | null
          generated_by: string
          id?: string
          is_official?: boolean
          language?: string
          render_fallback_reason?: string | null
          renderer?: string | null
          report_period_end?: string | null
          report_period_start?: string | null
          report_types: string[]
          shared_with?: string[]
          team_id?: string | null
        }
        Update: {
          additional_instructions?: string | null
          ai_summary?: string | null
          athlete_ids?: string[]
          audience?: string
          created_at?: string
          file_url?: string | null
          flagged_by?: string | null
          flagged_for_review?: boolean
          flagged_note?: string | null
          generated_by?: string
          id?: string
          is_official?: boolean
          language?: string
          render_fallback_reason?: string | null
          renderer?: string | null
          report_period_end?: string | null
          report_period_start?: string | null
          report_types?: string[]
          shared_with?: string[]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission_overrides: {
        Row: {
          access_level: string
          created_at: string
          id: string
          module: string
          profile_id: string
          set_by: string | null
        }
        Insert: {
          access_level: string
          created_at?: string
          id?: string
          module: string
          profile_id: string
          set_by?: string | null
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          module?: string
          profile_id?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_overrides_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          access_level: string
          created_at: string
          id: string
          module: string
          role: string
        }
        Insert: {
          access_level: string
          created_at?: string
          id?: string
          module: string
          role: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          module?: string
          role?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          city: string | null
          created_at: string
          id: string
          name: string
          sport: string | null
          timezone: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          name: string
          sport?: string | null
          timezone?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          sport?: string | null
          timezone?: string
        }
        Relationships: []
      }
      skinfold_equations: {
        Row: {
          age_max: number | null
          age_min: number | null
          citation: string
          created_at: string
          id: string
          label: string
          notes: string | null
          site_map: Json
          site_map_version: string | null
          verified_sexes: string[]
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          citation: string
          created_at?: string
          id: string
          label: string
          notes?: string | null
          site_map?: Json
          site_map_version?: string | null
          verified_sexes?: string[]
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          citation?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          site_map?: Json
          site_map_version?: string | null
          verified_sexes?: string[]
        }
        Relationships: []
      }
      staff_team_assignments: {
        Row: {
          access_level: string
          created_at: string
          id: string
          staff_profile_id: string
          team_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          staff_profile_id: string
          team_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          staff_profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_team_assignments_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          profile_id: string
          status: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          profile_id: string
          status?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplement_library: {
        Row: {
          age_max: number | null
          age_min: number | null
          alternatives: string[] | null
          category: string
          category_group: string | null
          contraindicated_conditions: string[] | null
          created_at: string
          cultural_notes: string | null
          diet_compatibility: string[] | null
          ethnicity_dosing_notes: string | null
          evidence_grade: string | null
          id: string
          name: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          alternatives?: string[] | null
          category: string
          category_group?: string | null
          contraindicated_conditions?: string[] | null
          created_at?: string
          cultural_notes?: string | null
          diet_compatibility?: string[] | null
          ethnicity_dosing_notes?: string | null
          evidence_grade?: string | null
          id?: string
          name: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          alternatives?: string[] | null
          category?: string
          category_group?: string | null
          contraindicated_conditions?: string[] | null
          created_at?: string
          cultural_notes?: string | null
          diet_compatibility?: string[] | null
          ethnicity_dosing_notes?: string | null
          evidence_grade?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      supplement_protocols: {
        Row: {
          athlete_id: string
          created_at: string
          dose: string
          end_date: string | null
          id: string
          prescribed_by: string
          product_id: string | null
          rationale: string | null
          start_date: string
          supplement_library_id: string | null
          supplement_name: string
          timing: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          dose: string
          end_date?: string | null
          id?: string
          prescribed_by: string
          product_id?: string | null
          rationale?: string | null
          start_date?: string
          supplement_library_id?: string | null
          supplement_name: string
          timing: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          dose?: string
          end_date?: string | null
          id?: string
          prescribed_by?: string
          product_id?: string | null
          rationale?: string | null
          start_date?: string
          supplement_library_id?: string | null
          supplement_name?: string
          timing?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplement_protocols_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_protocols_prescribed_by_fkey"
            columns: ["prescribed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_protocols_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_protocols_supplement_library_id_fkey"
            columns: ["supplement_library_id"]
            isOneToOne: false
            referencedRelation: "supplement_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_protocols_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          category: string | null
          club_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          club_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          club_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "athlete_own_club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "consultant_referred_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_load_plans: {
        Row: {
          athlete_id: string | null
          created_at: string
          created_by: string
          date: string
          estimated_sweat_rate_ml: number | null
          id: string
          intensity: string | null
          rpe: number | null
          season_phase: string | null
          session_duration_band: string | null
          session_type: string | null
          team_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string
          created_by: string
          date: string
          estimated_sweat_rate_ml?: number | null
          id?: string
          intensity?: string | null
          rpe?: number | null
          season_phase?: string | null
          session_duration_band?: string | null
          session_type?: string | null
          team_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string
          date?: string
          estimated_sweat_rate_ml?: number | null
          id?: string
          intensity?: string | null
          rpe?: number | null
          season_phase?: string | null
          session_duration_band?: string | null
          session_type?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_load_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_load_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_load_plans_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_last_context: {
        Row: {
          context_id: string
          context_type: string
          last_used_at: string
          profile_id: string
        }
        Insert: {
          context_id: string
          context_type: string
          last_used_at?: string
          profile_id: string
        }
        Update: {
          context_id?: string
          context_type?: string
          last_used_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_last_context_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vald_data: {
        Row: {
          asymmetry_pct: number | null
          athlete_id: string
          created_at: string
          date: string
          id: string
          metric_json: Json
          provider_id: string
          test_type: string
          updated_at: string | null
          updated_by: string | null
          validity_tier: string
        }
        Insert: {
          asymmetry_pct?: number | null
          athlete_id: string
          created_at?: string
          date: string
          id?: string
          metric_json?: Json
          provider_id: string
          test_type: string
          updated_at?: string | null
          updated_by?: string | null
          validity_tier: string
        }
        Update: {
          asymmetry_pct?: number | null
          athlete_id?: string
          created_at?: string
          date?: string
          id?: string
          metric_json?: Json
          provider_id?: string
          test_type?: string
          updated_at?: string | null
          updated_by?: string | null
          validity_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "vald_data_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vald_data_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vald_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      athlete_own_club: {
        Row: {
          id: string | null
          name: string | null
        }
        Relationships: []
      }
      consultant_referred_clubs: {
        Row: {
          id: string | null
          name: string | null
        }
        Relationships: []
      }
      injuries_athlete_view: {
        Row: {
          athlete_id: string | null
          rtp_phase: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "injuries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      athlete_has_any_team: { Args: { p_athlete_id: string }; Returns: boolean }
      athlete_type: { Args: { p_athlete_id: string }; Returns: string }
      can_message_profile: {
        Args: { p_recipient_id: string }
        Returns: boolean
      }
      current_profile_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      has_independent_access_to_athlete: {
        Args: { p_athlete_id: string }
        Returns: boolean
      }
      is_admin_for_club: { Args: { p_club_id: string }; Returns: boolean }
      is_admin_for_segment: { Args: { p_segment_id: string }; Returns: boolean }
      is_assigned_to_athlete_via_team: {
        Args: { p_athlete_id: string }
        Returns: boolean
      }
      is_assigned_to_team: { Args: { p_team_id: string }; Returns: boolean }
      is_club_manager_for_club: {
        Args: { p_club_id: string }
        Returns: boolean
      }
      is_club_staff_for_club: { Args: { p_club_id: string }; Returns: boolean }
      is_message_participant: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      is_message_sender: { Args: { p_message_id: string }; Returns: boolean }
      is_own_athlete_profile: {
        Args: { p_athlete_id: string }
        Returns: boolean
      }
      is_own_team: { Args: { p_team_id: string }; Returns: boolean }
      is_staff_linked_to_current_athlete: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      shares_club_with_staff: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      shares_team_with_staff: { Args: { p_team_id: string }; Returns: boolean }
      within_checkin_window: {
        Args: { p_date: string; p_days: number }
        Returns: boolean
      }
      within_edit_window: {
        Args: { p_created_at: string; p_days: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
