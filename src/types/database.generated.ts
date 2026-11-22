/**
 * !! 自動生成ファイル。手で編集しないこと !!
 *
 * Supabase の型生成(supabase gen types)の出力。再生成は:
 *   bash scripts/gen-types.sh
 * アプリ固有の型(jsonb の中身、追記専用テーブル)は src/types/database.ts で重ねている。
 * 画面やAPIからは、このファイルではなく "@/types/database" を import すること。
 */
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          title: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          title: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          title?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          participant_id: string | null
          round_id: string | null
          summary: string
          tournament_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          participant_id?: string | null
          round_id?: string | null
          summary: string
          tournament_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          participant_id?: string | null
          round_id?: string | null
          summary?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      display_layouts: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          name: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          name: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          name?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_layouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_layouts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          affiliation: string | null
          answers: Json
          display_name: string
          email: string
          id: string
          status: Database["public"]["Enums"]["entry_status"]
          submitted_at: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          affiliation?: string | null
          answers?: Json
          display_name: string
          email: string
          id?: string
          status?: Database["public"]["Enums"]["entry_status"]
          submitted_at?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          affiliation?: string | null
          answers?: Json
          display_name?: string
          email?: string
          id?: string
          status?: Database["public"]["Enums"]["entry_status"]
          submitted_at?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_form_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: Database["public"]["Enums"]["entry_field_type"]
          id: string
          is_required: boolean
          label: string
          options: Json | null
          sort_order: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: Database["public"]["Enums"]["entry_field_type"]
          id?: string
          is_required?: boolean
          label: string
          options?: Json | null
          sort_order?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["entry_field_type"]
          id?: string
          is_required?: boolean
          label?: string
          options?: Json | null
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_form_fields_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_answers: {
        Row: {
          created_at: string
          graded_by: string | null
          id: string
          is_correct: boolean
          participant_id: string
          question_id: string
          round_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          graded_by?: string | null
          id?: string
          is_correct: boolean
          participant_id: string
          question_id: string
          round_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          graded_by?: string | null
          id?: string
          is_correct?: boolean
          participant_id?: string
          question_id?: string
          round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_answers_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "paper_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_questions: {
        Row: {
          created_at: string
          id: string
          label: string | null
          number: number
          points: number
          round_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          number: number
          points?: number
          round_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          number?: number
          points?: number
          round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          affiliation: string | null
          created_at: string
          display_name: string
          entry_id: string | null
          id: string
          seed: number | null
          status: Database["public"]["Enums"]["participant_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          affiliation?: string | null
          created_at?: string
          display_name: string
          entry_id?: string | null
          id?: string
          seed?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          affiliation?: string | null
          created_at?: string
          display_name?: string
          entry_id?: string | null
          id?: string
          seed?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      round_participants: {
        Row: {
          correct_count: number
          created_at: string
          disqualified: boolean
          group_label: string | null
          id: string
          participant_id: string
          passed: boolean | null
          plate_color: string | null
          rank: number | null
          round_id: string
          score: number | null
          through_count: number
          updated_at: string
          won: boolean
          wrong_count: number
        }
        Insert: {
          correct_count?: number
          created_at?: string
          disqualified?: boolean
          group_label?: string | null
          id?: string
          participant_id: string
          passed?: boolean | null
          plate_color?: string | null
          rank?: number | null
          round_id: string
          score?: number | null
          through_count?: number
          updated_at?: string
          won?: boolean
          wrong_count?: number
        }
        Update: {
          correct_count?: number
          created_at?: string
          disqualified?: boolean
          group_label?: string | null
          id?: string
          participant_id?: string
          passed?: boolean | null
          plate_color?: string | null
          rank?: number | null
          round_id?: string
          score?: number | null
          through_count?: number
          updated_at?: string
          won?: boolean
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "round_participants_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_participants_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_score_state: {
        Row: {
          round_id: string
          seq: number
          updated_at: string
        }
        Insert: {
          round_id: string
          seq?: number
          updated_at?: string
        }
        Update: {
          round_id?: string
          seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_score_state_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          advance_count: number | null
          created_at: string
          current_question_number: number
          id: string
          name: string
          results_public: boolean
          round_type: Database["public"]["Enums"]["round_type"]
          rule_config: Json
          sort_order: number
          stage_id: string | null
          status: Database["public"]["Enums"]["round_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          advance_count?: number | null
          created_at?: string
          current_question_number?: number
          id?: string
          name: string
          results_public?: boolean
          round_type?: Database["public"]["Enums"]["round_type"]
          rule_config?: Json
          sort_order?: number
          stage_id?: string | null
          status?: Database["public"]["Enums"]["round_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          advance_count?: number | null
          created_at?: string
          current_question_number?: number
          id?: string
          name?: string
          results_public?: boolean
          round_type?: Database["public"]["Enums"]["round_type"]
          rule_config?: Json
          sort_order?: number
          stage_id?: string | null
          status?: Database["public"]["Enums"]["round_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_items: {
        Row: {
          created_at: string
          id: string
          label: string
          scheduled_at: string | null
          sort_order: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          scheduled_at?: string | null
          sort_order?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          scheduled_at?: string | null
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      score_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["score_event_type"]
          id: string
          participant_id: string
          question_number: number | null
          round_id: string
          value: number | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["score_event_type"]
          id?: string
          participant_id: string
          question_number?: number | null
          round_id: string
          value?: number | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["score_event_type"]
          id?: string
          participant_id?: string
          question_number?: number | null
          round_id?: string
          value?: number | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tournament_member_role"]
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tournament_member_role"]
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tournament_member_role"]
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          capacity: number | null
          contact_info: string | null
          created_at: string
          entry_auto_register: boolean
          entry_ends_at: string | null
          entry_starts_at: string | null
          event_ends_at: string | null
          event_starts_at: string | null
          id: string
          logo_url: string | null
          main_visual_url: string | null
          name: string
          notes: string | null
          organizer_name: string | null
          owner_id: string
          rules_content: string | null
          show_entry_count: boolean
          slug: string
          status: Database["public"]["Enums"]["tournament_status"]
          summary: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          capacity?: number | null
          contact_info?: string | null
          created_at?: string
          entry_auto_register?: boolean
          entry_ends_at?: string | null
          entry_starts_at?: string | null
          event_ends_at?: string | null
          event_starts_at?: string | null
          id?: string
          logo_url?: string | null
          main_visual_url?: string | null
          name: string
          notes?: string | null
          organizer_name?: string | null
          owner_id: string
          rules_content?: string | null
          show_entry_count?: boolean
          slug: string
          status?: Database["public"]["Enums"]["tournament_status"]
          summary?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          capacity?: number | null
          contact_info?: string | null
          created_at?: string
          entry_auto_register?: boolean
          entry_ends_at?: string | null
          entry_starts_at?: string | null
          event_ends_at?: string | null
          event_starts_at?: string | null
          id?: string
          logo_url?: string | null
          main_visual_url?: string | null
          name?: string
          notes?: string | null
          organizer_name?: string | null
          owner_id?: string
          rules_content?: string | null
          show_entry_count?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          summary?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_round_question: {
        Args: {
          p_direction: string
          p_round_id: string
          p_tournament_id: string
        }
        Returns: number
      }
      apply_round_computation: {
        Args: { p_expected_seq: number; p_round_id: string; p_rows: Json }
        Returns: boolean
      }
      can_operate_score: { Args: { p_tournament_id: string }; Returns: boolean }
      can_write_round_participants: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      change_tournament_status: {
        Args: { p_reason?: string; p_status: string; p_tournament_id: string }
        Returns: {
          capacity: number | null
          contact_info: string | null
          created_at: string
          entry_auto_register: boolean
          entry_ends_at: string | null
          entry_starts_at: string | null
          event_ends_at: string | null
          event_starts_at: string | null
          id: string
          logo_url: string | null
          main_visual_url: string | null
          name: string
          notes: string | null
          organizer_name: string | null
          owner_id: string
          rules_content: string | null
          show_entry_count: boolean
          slug: string
          status: Database["public"]["Enums"]["tournament_status"]
          summary: string | null
          updated_at: string
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tournaments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_round_score_seq: { Args: { p_round_id: string }; Returns: number }
      has_tournament_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["tournament_member_role"][]
          p_tournament_id: string
        }
        Returns: boolean
      }
      is_tournament_admin: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      is_tournament_member: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      lock_round_score_state: { Args: { p_round_id: string }; Returns: number }
      paper_recompute_round: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      public_entry_count: { Args: { p_slug: string }; Returns: number }
      public_tournament_results: {
        Args: { p_slug: string }
        Returns: {
          affiliation: string
          display_name: string
          passed: boolean
          rank: number
          round_id: string
          round_name: string
          round_sort: number
          score: number
        }[]
      }
      recompute_paper_round: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      record_score_event: {
        Args: {
          p_event_type: Database["public"]["Enums"]["score_event_type"]
          p_participant_id: string
          p_round_id: string
          p_tournament_id: string
          p_value?: number
        }
        Returns: {
          actor_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["score_event_type"]
          id: string
          participant_id: string
          question_number: number | null
          round_id: string
          value: number | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "score_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_paper_answers: {
        Args: { p_answers: Json; p_round_id: string }
        Returns: undefined
      }
      tournament_status_requires_reason: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      tournament_status_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      undo_last_score_event: {
        Args: { p_round_id: string; p_tournament_id: string }
        Returns: string
      }
    }
    Enums: {
      entry_field_type:
        | "TEXT"
        | "TEXTAREA"
        | "EMAIL"
        | "NUMBER"
        | "SELECT"
        | "CHECKBOX"
      entry_status: "SUBMITTED" | "WITHDRAWN"
      participant_status: "ACTIVE" | "DISQUALIFIED" | "ABSENT" | "WITHDRAWN"
      round_status: "NOT_STARTED" | "RUNNING" | "PAUSED" | "FINISHED"
      round_type: "PAPER" | "BUZZER"
      score_event_type:
        | "CORRECT"
        | "WRONG"
        | "THROUGH"
        | "MANUAL_ADJUST"
        | "DISQUALIFY"
        | "REINSTATE"
      tournament_member_role:
        | "OWNER"
        | "ADMIN"
        | "QUESTION_MANAGER"
        | "SCORE_OPERATOR"
        | "GRADER"
        | "STREAM_OPERATOR"
        | "VENUE_STAFF"
        | "VIEWER"
      tournament_status:
        | "DRAFT"
        | "REGISTRATION_OPEN"
        | "REGISTRATION_CLOSED"
        | "RUNNING"
        | "FINISHED"
        | "PUBLISHED"
        | "CANCELLED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      entry_field_type: [
        "TEXT",
        "TEXTAREA",
        "EMAIL",
        "NUMBER",
        "SELECT",
        "CHECKBOX",
      ],
      entry_status: ["SUBMITTED", "WITHDRAWN"],
      participant_status: ["ACTIVE", "DISQUALIFIED", "ABSENT", "WITHDRAWN"],
      round_status: ["NOT_STARTED", "RUNNING", "PAUSED", "FINISHED"],
      round_type: ["PAPER", "BUZZER"],
      score_event_type: [
        "CORRECT",
        "WRONG",
        "THROUGH",
        "MANUAL_ADJUST",
        "DISQUALIFY",
        "REINSTATE",
      ],
      tournament_member_role: [
        "OWNER",
        "ADMIN",
        "QUESTION_MANAGER",
        "SCORE_OPERATOR",
        "GRADER",
        "STREAM_OPERATOR",
        "VENUE_STAFF",
        "VIEWER",
      ],
      tournament_status: [
        "DRAFT",
        "REGISTRATION_OPEN",
        "REGISTRATION_CLOSED",
        "RUNNING",
        "FINISHED",
        "PUBLISHED",
        "CANCELLED",
      ],
    },
  },
} as const
