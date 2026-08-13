/**
 * Hand-written Supabase Database types matching
 * supabase/migrations/0001_init.sql - 0004_stages_rules.sql.
 *
 * TODO(phase-1-followup): once a live Supabase project exists, replace this
 * file with the generated output of:
 *   supabase gen types typescript --project-id <id> > src/types/database.ts
 * Keep the shape identical so imports elsewhere don't need to change.
 */
import type { RuleConfig, ScoreEventType } from "@/lib/rules/types";
import type { DisplayLayoutData } from "@/lib/display/types";

export type TournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "RUNNING"
  | "FINISHED"
  | "PUBLISHED";

export type TournamentMemberRole =
  | "OWNER"
  | "ADMIN"
  | "QUESTION_MANAGER"
  | "SCORE_OPERATOR"
  | "GRADER"
  | "STREAM_OPERATOR"
  | "VENUE_STAFF"
  | "VIEWER";

export type EntryFieldType = "TEXT" | "TEXTAREA" | "EMAIL" | "NUMBER" | "SELECT" | "CHECKBOX";

export type EntryStatus = "SUBMITTED" | "WITHDRAWN";

export type ParticipantStatus = "ACTIVE" | "DISQUALIFIED" | "ABSENT" | "WITHDRAWN";

export type RoundType = "PAPER" | "BUZZER";

export type RoundStatus = "NOT_STARTED" | "RUNNING" | "PAUSED" | "FINISHED";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email: string;
          avatar_url?: string | null;
        };
        Update: Partial<{
          display_name: string;
          avatar_url: string | null;
        }>;
        Relationships: [];
      };
      tournaments: {
        Row: {
          id: string;
          slug: string;
          name: string;
          status: TournamentStatus;
          owner_id: string;
          summary: string | null;
          logo_url: string | null;
          main_visual_url: string | null;
          venue: string | null;
          organizer_name: string | null;
          contact_info: string | null;
          rules_content: string | null;
          notes: string | null;
          event_starts_at: string | null;
          event_ends_at: string | null;
          entry_starts_at: string | null;
          entry_ends_at: string | null;
          capacity: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          status?: TournamentStatus;
          owner_id: string;
          summary?: string | null;
          logo_url?: string | null;
          main_visual_url?: string | null;
          venue?: string | null;
          organizer_name?: string | null;
          contact_info?: string | null;
          rules_content?: string | null;
          notes?: string | null;
          event_starts_at?: string | null;
          event_ends_at?: string | null;
          entry_starts_at?: string | null;
          entry_ends_at?: string | null;
          capacity?: number | null;
        };
        Update: Partial<{
          slug: string;
          name: string;
          status: TournamentStatus;
          summary: string | null;
          logo_url: string | null;
          main_visual_url: string | null;
          venue: string | null;
          organizer_name: string | null;
          contact_info: string | null;
          rules_content: string | null;
          notes: string | null;
          event_starts_at: string | null;
          event_ends_at: string | null;
          entry_starts_at: string | null;
          entry_ends_at: string | null;
          capacity: number | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "tournaments_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tournament_members: {
        Row: {
          id: string;
          tournament_id: string;
          user_id: string;
          role: TournamentMemberRole;
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          user_id: string;
          role: TournamentMemberRole;
          invited_by?: string | null;
        };
        Update: Partial<{
          role: TournamentMemberRole;
        }>;
        Relationships: [
          {
            foreignKeyName: "tournament_members_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          id: string;
          tournament_id: string;
          title: string;
          body: string;
          is_published: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          title: string;
          body: string;
          is_published?: boolean;
          created_by?: string | null;
        };
        Update: Partial<{
          title: string;
          body: string;
          is_published: boolean;
        }>;
        Relationships: [
          {
            foreignKeyName: "announcements_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_items: {
        Row: {
          id: string;
          tournament_id: string;
          label: string;
          scheduled_at: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          label: string;
          scheduled_at?: string | null;
          sort_order?: number;
        };
        Update: Partial<{
          label: string;
          scheduled_at: string | null;
          sort_order: number;
        }>;
        Relationships: [
          {
            foreignKeyName: "schedule_items_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_form_fields: {
        Row: {
          id: string;
          tournament_id: string;
          field_key: string;
          label: string;
          field_type: EntryFieldType;
          is_required: boolean;
          options: string[] | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          field_key: string;
          label: string;
          field_type?: EntryFieldType;
          is_required?: boolean;
          options?: string[] | null;
          sort_order?: number;
        };
        Update: Partial<{
          field_key: string;
          label: string;
          field_type: EntryFieldType;
          is_required: boolean;
          options: string[] | null;
          sort_order: number;
        }>;
        Relationships: [
          {
            foreignKeyName: "entry_form_fields_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      entries: {
        Row: {
          id: string;
          tournament_id: string;
          display_name: string;
          email: string;
          affiliation: string | null;
          answers: Record<string, string | number | boolean | null>;
          status: EntryStatus;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          display_name: string;
          email: string;
          affiliation?: string | null;
          answers?: Record<string, string | number | boolean | null>;
          status?: EntryStatus;
        };
        Update: Partial<{
          display_name: string;
          email: string;
          affiliation: string | null;
          answers: Record<string, string | number | boolean | null>;
          status: EntryStatus;
        }>;
        Relationships: [
          {
            foreignKeyName: "entries_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      participants: {
        Row: {
          id: string;
          tournament_id: string;
          entry_id: string | null;
          display_name: string;
          affiliation: string | null;
          status: ParticipantStatus;
          seed: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          entry_id?: string | null;
          display_name: string;
          affiliation?: string | null;
          status?: ParticipantStatus;
          seed?: number | null;
        };
        Update: Partial<{
          display_name: string;
          affiliation: string | null;
          status: ParticipantStatus;
          seed: number | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "participants_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participants_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      rounds: {
        Row: {
          id: string;
          tournament_id: string;
          stage_id: string | null;
          name: string;
          round_type: RoundType;
          status: RoundStatus;
          sort_order: number;
          advance_count: number | null;
          rule_config: RuleConfig;
          current_question_number: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          stage_id?: string | null;
          name: string;
          round_type?: RoundType;
          status?: RoundStatus;
          sort_order?: number;
          advance_count?: number | null;
          rule_config?: RuleConfig;
          current_question_number?: number;
        };
        Update: Partial<{
          stage_id: string | null;
          name: string;
          round_type: RoundType;
          status: RoundStatus;
          sort_order: number;
          advance_count: number | null;
          rule_config: RuleConfig;
          current_question_number: number;
        }>;
        Relationships: [
          {
            foreignKeyName: "rounds_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id"];
          },
        ];
      };
      stages: {
        Row: {
          id: string;
          tournament_id: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          name: string;
          sort_order?: number;
        };
        Update: Partial<{
          name: string;
          sort_order: number;
        }>;
        Relationships: [
          {
            foreignKeyName: "stages_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      round_participants: {
        Row: {
          id: string;
          round_id: string;
          participant_id: string;
          group_label: string | null;
          score: number | null;
          rank: number | null;
          passed: boolean | null;
          correct_count: number;
          wrong_count: number;
          through_count: number;
          disqualified: boolean;
          won: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          participant_id: string;
          group_label?: string | null;
          score?: number | null;
          rank?: number | null;
          passed?: boolean | null;
          correct_count?: number;
          wrong_count?: number;
          through_count?: number;
          disqualified?: boolean;
          won?: boolean;
        };
        Update: Partial<{
          group_label: string | null;
          score: number | null;
          rank: number | null;
          passed: boolean | null;
          correct_count: number;
          wrong_count: number;
          through_count: number;
          disqualified: boolean;
          won: boolean;
        }>;
        Relationships: [
          {
            foreignKeyName: "round_participants_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "round_participants_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      score_events: {
        Row: {
          id: string;
          round_id: string;
          participant_id: string;
          event_type: ScoreEventType;
          value: number | null;
          question_number: number | null;
          actor_id: string | null;
          voided_at: string | null;
          voided_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          participant_id: string;
          event_type: ScoreEventType;
          value?: number | null;
          question_number?: number | null;
          actor_id?: string | null;
        };
        Update: Partial<{
          voided_at: string | null;
          voided_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "score_events_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "score_events_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          tournament_id: string;
          actor_id: string | null;
          action: string;
          round_id: string | null;
          participant_id: string | null;
          summary: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          actor_id?: string | null;
          action: string;
          round_id?: string | null;
          participant_id?: string | null;
          summary: string;
          metadata?: Record<string, unknown>;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "audit_logs_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      display_layouts: {
        Row: {
          id: string;
          tournament_id: string;
          name: string;
          data: DisplayLayoutData;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          name: string;
          data?: DisplayLayoutData;
          created_by?: string | null;
        };
        Update: Partial<{
          name: string;
          data: DisplayLayoutData;
        }>;
        Relationships: [
          {
            foreignKeyName: "display_layouts_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_tournament_member: {
        Args: { p_tournament_id: string };
        Returns: boolean;
      };
      is_tournament_admin: {
        Args: { p_tournament_id: string };
        Returns: boolean;
      };
      has_tournament_role: {
        Args: { p_tournament_id: string; p_roles: TournamentMemberRole[] };
        Returns: boolean;
      };
    };
  };
}
