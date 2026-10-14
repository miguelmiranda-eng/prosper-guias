// PROVISIONAL: escrito a mano a partir de supabase/migrations. Se reemplaza por el generado
// (Supabase → generate_typescript_types) en cuanto exista el proyecto.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type WorkspaceRole = "owner" | "admin" | "editor" | "member" | "viewer";
type GuideStatus = "draft" | "published" | "archived";
type GuideVisibility = "private" | "workspace";
type StepKind = "action" | "manual";
type NoteKind = "tip" | "warning" | "info";

type StepRowT = {
  id: string;
  guide_id: string;
  position: number;
  kind: StepKind;
  action: string | null;
  instruction: string;
  note: string;
  note_kind: NoteKind | null;
  page_url: string | null;
  page_title: string | null;
  element_label: string | null;
  screenshot_path: string | null;
  click_x: number | null;
  click_y: number | null;
  created_at: string;
  updated_at: string;
};

type VersionRowT = {
  id: string;
  guide_id: string;
  version_no: number;
  label: string;
  snapshot: Json;
  step_count: number;
  created_by: string;
  created_at: string;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13.0.5" };
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string; email: string; created_at: string };
        Insert: { id: string; full_name?: string; email: string; created_at?: string };
        Update: { id?: string; full_name?: string; email?: string; created_at?: string };
        Relationships: [];
      };
      workspaces: {
        Row: { id: string; name: string; created_by: string; created_at: string };
        Insert: { id?: string; name: string; created_by: string; created_at?: string };
        Update: { id?: string; name?: string; created_by?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "workspaces_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      workspace_members: {
        Row: { workspace_id: string; user_id: string; role: WorkspaceRole; created_at: string };
        Insert: { workspace_id: string; user_id: string; role?: WorkspaceRole; created_at?: string };
        Update: { workspace_id?: string; user_id?: string; role?: WorkspaceRole; created_at?: string };
        Relationships: [
          { foreignKeyName: "workspace_members_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "workspace_members_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
      guides: {
        Row: {
          id: string;
          workspace_id: string;
          owner_id: string;
          title: string;
          description: string;
          status: GuideStatus;
          visibility: GuideVisibility;
          source: string;
          recording: boolean;
          created_at: string;
          updated_at: string;
          published_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          owner_id: string;
          title?: string;
          description?: string;
          status?: GuideStatus;
          visibility?: GuideVisibility;
          source?: string;
          recording?: boolean;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          owner_id?: string;
          title?: string;
          description?: string;
          status?: GuideStatus;
          visibility?: GuideVisibility;
          source?: string;
          recording?: boolean;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [
          { foreignKeyName: "guides_deleted_by_fkey"; columns: ["deleted_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "guides_owner_id_fkey"; columns: ["owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "guides_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
      guide_steps: {
        Row: StepRowT;
        Insert: Partial<StepRowT> & { guide_id: string; position: number };
        Update: Partial<StepRowT>;
        Relationships: [
          { foreignKeyName: "guide_steps_guide_id_fkey"; columns: ["guide_id"]; isOneToOne: false; referencedRelation: "guides"; referencedColumns: ["id"] },
        ];
      };
      guide_versions: {
        Row: VersionRowT;
        Insert: Partial<VersionRowT> & { guide_id: string; version_no: number; snapshot: Json; created_by: string };
        Update: Partial<VersionRowT>;
        Relationships: [
          { foreignKeyName: "guide_versions_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "guide_versions_guide_id_fkey"; columns: ["guide_id"]; isOneToOne: false; referencedRelation: "guides"; referencedColumns: ["id"] },
        ];
      };
      activity_log: {
        Row: {
          id: number;
          workspace_id: string;
          actor_id: string | null;
          entity_type: string;
          entity_id: string;
          action: string;
          meta: Json;
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          actor_id?: string | null;
          entity_type: string;
          entity_id: string;
          action: string;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          workspace_id?: string;
          actor_id?: string | null;
          entity_type?: string;
          entity_id?: string;
          action?: string;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "activity_log_actor_id_fkey"; columns: ["actor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "activity_log_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      insert_step: {
        Args: {
          p_guide: string;
          p_position?: number;
          p_kind?: StepKind;
          p_action?: string;
          p_instruction?: string;
          p_page_url?: string;
          p_page_title?: string;
          p_element_label?: string;
          p_screenshot_path?: string;
          p_click_x?: number;
          p_click_y?: number;
        };
        Returns: StepRowT;
      };
      delete_step: { Args: { p_step: string }; Returns: undefined };
      duplicate_step: { Args: { p_step: string }; Returns: StepRowT };
      reorder_steps: { Args: { p_guide: string; p_ids: string[] }; Returns: undefined };
      create_version: { Args: { p_guide: string; p_label?: string }; Returns: VersionRowT };
      restore_version: { Args: { p_version: string }; Returns: undefined };
      add_member: { Args: { p_ws: string; p_email: string; p_role: WorkspaceRole }; Returns: undefined };
      update_member_role: { Args: { p_ws: string; p_user: string; p_role: WorkspaceRole }; Returns: undefined };
      remove_member: { Args: { p_ws: string; p_user: string }; Returns: undefined };
      can_read_guide: { Args: { gid: string }; Returns: boolean };
      can_edit_guide: { Args: { gid: string }; Returns: boolean };
      can_manage_guide: { Args: { gid: string }; Returns: boolean };
      ws_role: { Args: { ws: string }; Returns: WorkspaceRole };
    };
    Enums: {
      workspace_role: WorkspaceRole;
      guide_status: GuideStatus;
      guide_visibility: GuideVisibility;
      step_kind: StepKind;
      note_kind: NoteKind;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
