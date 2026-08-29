export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      action_candidates: {
        Row: {
          action_id: string;
          confidence: number;
          confirmation: string;
          contract: Json;
          created_at: string;
          description: string;
          id: string;
          name: string;
          org_id: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          risk_level: Database["public"]["Enums"]["risk_level"];
          run_id: string;
          status: Database["public"]["Enums"]["candidate_status"];
          title: string;
          validation_issues: Json;
        };
        Insert: {
          action_id: string;
          confidence: number;
          confirmation: string;
          contract: Json;
          created_at?: string;
          description: string;
          id?: string;
          name: string;
          org_id: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          risk_level: Database["public"]["Enums"]["risk_level"];
          run_id: string;
          status?: Database["public"]["Enums"]["candidate_status"];
          title: string;
          validation_issues?: Json;
        };
        Update: {
          action_id?: string;
          confidence?: number;
          confirmation?: string;
          contract?: Json;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          org_id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          risk_level?: Database["public"]["Enums"]["risk_level"];
          run_id?: string;
          status?: Database["public"]["Enums"]["candidate_status"];
          title?: string;
          validation_issues?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "action_candidates_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_candidates_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "analysis_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      analysis_runs: {
        Row: {
          commit_id: string;
          created_at: string;
          error: Json | null;
          finished_at: string | null;
          id: string;
          org_id: string;
          repository_id: string;
          requested_by: string | null;
          stage: Database["public"]["Enums"]["analysis_stage"];
          stage_statuses: Json;
          started_at: string | null;
          status: Database["public"]["Enums"]["run_status"];
        };
        Insert: {
          commit_id: string;
          created_at?: string;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          org_id: string;
          repository_id: string;
          requested_by?: string | null;
          stage?: Database["public"]["Enums"]["analysis_stage"];
          stage_statuses?: Json;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["run_status"];
        };
        Update: {
          commit_id?: string;
          created_at?: string;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          org_id?: string;
          repository_id?: string;
          requested_by?: string | null;
          stage?: Database["public"]["Enums"]["analysis_stage"];
          stage_statuses?: Json;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["run_status"];
        };
        Relationships: [
          {
            foreignKeyName: "analysis_runs_commit_id_fkey";
            columns: ["commit_id"];
            isOneToOne: false;
            referencedRelation: "repository_commits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analysis_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analysis_runs_repository_id_fkey";
            columns: ["repository_id"];
            isOneToOne: false;
            referencedRelation: "repositories";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor: string | null;
          created_at: string;
          data: Json;
          id: number;
          org_id: string;
          subject_id: string;
          subject_type: string;
        };
        Insert: {
          action: string;
          actor?: string | null;
          created_at?: string;
          data?: Json;
          id?: never;
          org_id: string;
          subject_id: string;
          subject_type: string;
        };
        Update: {
          action?: string;
          actor?: string | null;
          created_at?: string;
          data?: Json;
          id?: never;
          org_id?: string;
          subject_id?: string;
          subject_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      compat_findings: {
        Row: {
          commit_sha: string;
          created_at: string;
          finding: Json;
          id: string;
          org_id: string;
          repository_id: string;
          severity: string;
          site_id: string | null;
          status: string;
        };
        Insert: {
          commit_sha: string;
          created_at?: string;
          finding: Json;
          id?: string;
          org_id: string;
          repository_id: string;
          severity: string;
          site_id?: string | null;
          status?: string;
        };
        Update: {
          commit_sha?: string;
          created_at?: string;
          finding?: Json;
          id?: string;
          org_id?: string;
          repository_id?: string;
          severity?: string;
          site_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compat_findings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compat_findings_repository_id_fkey";
            columns: ["repository_id"];
            isOneToOne: false;
            referencedRelation: "repositories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compat_findings_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      contract_versions: {
        Row: {
          contract: Json;
          contract_id: string;
          created_at: string;
          created_by: string | null;
          created_from_candidate: string | null;
          id: string;
          org_id: string;
          version: number;
        };
        Insert: {
          contract: Json;
          contract_id: string;
          created_at?: string;
          created_by?: string | null;
          created_from_candidate?: string | null;
          id?: string;
          org_id: string;
          version: number;
        };
        Update: {
          contract?: Json;
          contract_id?: string;
          created_at?: string;
          created_by?: string | null;
          created_from_candidate?: string | null;
          id?: string;
          org_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "tool_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contract_versions_created_from_candidate_fkey";
            columns: ["created_from_candidate"];
            isOneToOne: false;
            referencedRelation: "action_candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contract_versions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      discovered_routes: {
        Row: {
          file_path: string;
          id: string;
          kind: string;
          meta: Json;
          org_id: string;
          path_pattern: string;
          run_id: string;
          url_pattern: string;
        };
        Insert: {
          file_path: string;
          id?: string;
          kind: string;
          meta?: Json;
          org_id: string;
          path_pattern: string;
          run_id: string;
          url_pattern: string;
        };
        Update: {
          file_path?: string;
          id?: string;
          kind?: string;
          meta?: Json;
          org_id?: string;
          path_pattern?: string;
          run_id?: string;
          url_pattern?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovered_routes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovered_routes_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "analysis_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_runs: {
        Row: {
          candidate_id: string;
          created_at: string;
          details: Json;
          id: string;
          name: string;
          org_id: string;
          passed: boolean;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          details?: Json;
          id?: string;
          name: string;
          org_id: string;
          passed: boolean;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          details?: Json;
          id?: string;
          name?: string;
          org_id?: string;
          passed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "eval_runs_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "action_candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      github_installations: {
        Row: {
          account_login: string;
          account_type: string;
          created_at: string;
          created_by: string;
          id: string;
          installation_id: number;
          org_id: string;
          suspended_at: string | null;
        };
        Insert: {
          account_login: string;
          account_type?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          installation_id: number;
          org_id: string;
          suspended_at?: string | null;
        };
        Update: {
          account_login?: string;
          account_type?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          installation_id?: number;
          org_id?: string;
          suspended_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "github_installations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_prs: {
        Row: {
          branch: string;
          created_at: string;
          created_by: string | null;
          error: Json | null;
          id: string;
          org_id: string;
          pr_number: number | null;
          repository_id: string;
          site_id: string | null;
          status: string;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          branch: string;
          created_at?: string;
          created_by?: string | null;
          error?: Json | null;
          id?: string;
          org_id: string;
          pr_number?: number | null;
          repository_id: string;
          site_id?: string | null;
          status?: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          branch?: string;
          created_at?: string;
          created_by?: string | null;
          error?: Json | null;
          id?: string;
          org_id?: string;
          pr_number?: number | null;
          repository_id?: string;
          site_id?: string | null;
          status?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_prs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_prs_repository_id_fkey";
            columns: ["repository_id"];
            isOneToOne: false;
            referencedRelation: "repositories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_prs_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      manifest_deployments: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          manifest_id: string;
          org_id: string;
          performed_by: string | null;
          site_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          manifest_id: string;
          org_id: string;
          performed_by?: string | null;
          site_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          manifest_id?: string;
          org_id?: string;
          performed_by?: string | null;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manifest_deployments_manifest_id_fkey";
            columns: ["manifest_id"];
            isOneToOne: false;
            referencedRelation: "manifests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifest_deployments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifest_deployments_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      manifests: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          manifest: Json;
          org_id: string;
          published_at: string | null;
          signed: Json | null;
          site_id: string;
          status: Database["public"]["Enums"]["manifest_status"];
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          manifest: Json;
          org_id: string;
          published_at?: string | null;
          signed?: Json | null;
          site_id: string;
          status?: Database["public"]["Enums"]["manifest_status"];
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          manifest?: Json;
          org_id?: string;
          published_at?: string | null;
          signed?: Json | null;
          site_id?: string;
          status?: Database["public"]["Enums"]["manifest_status"];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "manifests_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifests_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memberships: {
        Row: {
          created_at: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          org_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      repositories: {
        Row: {
          created_at: string;
          default_branch: string;
          full_name: string;
          github_repo_id: number;
          id: string;
          installation_id: string;
          is_private: boolean;
          name: string;
          org_id: string;
          owner: string;
        };
        Insert: {
          created_at?: string;
          default_branch?: string;
          full_name: string;
          github_repo_id: number;
          id?: string;
          installation_id: string;
          is_private?: boolean;
          name: string;
          org_id: string;
          owner: string;
        };
        Update: {
          created_at?: string;
          default_branch?: string;
          full_name?: string;
          github_repo_id?: number;
          id?: string;
          installation_id?: string;
          is_private?: boolean;
          name?: string;
          org_id?: string;
          owner?: string;
        };
        Relationships: [
          {
            foreignKeyName: "repositories_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "github_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repositories_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      repository_commits: {
        Row: {
          id: string;
          message: string;
          org_id: string;
          ref: string | null;
          repository_id: string;
          seen_at: string;
          sha: string;
        };
        Insert: {
          id?: string;
          message?: string;
          org_id: string;
          ref?: string | null;
          repository_id: string;
          seen_at?: string;
          sha: string;
        };
        Update: {
          id?: string;
          message?: string;
          org_id?: string;
          ref?: string | null;
          repository_id?: string;
          seen_at?: string;
          sha?: string;
        };
        Relationships: [
          {
            foreignKeyName: "repository_commits_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repository_commits_repository_id_fkey";
            columns: ["repository_id"];
            isOneToOne: false;
            referencedRelation: "repositories";
            referencedColumns: ["id"];
          },
        ];
      };
      run_artifacts: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          meta: Json;
          org_id: string;
          run_id: string;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          meta?: Json;
          org_id: string;
          run_id: string;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          meta?: Json;
          org_id?: string;
          run_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_artifacts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_artifacts_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "analysis_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      sites: {
        Row: {
          allowed_origins: string[];
          created_at: string;
          current_manifest_id: string | null;
          id: string;
          org_id: string;
          repository_id: string;
          site_id: string;
        };
        Insert: {
          allowed_origins?: string[];
          created_at?: string;
          current_manifest_id?: string | null;
          id?: string;
          org_id: string;
          repository_id: string;
          site_id: string;
        };
        Update: {
          allowed_origins?: string[];
          created_at?: string;
          current_manifest_id?: string | null;
          id?: string;
          org_id?: string;
          repository_id?: string;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sites_current_manifest_fk";
            columns: ["current_manifest_id"];
            isOneToOne: false;
            referencedRelation: "manifests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sites_repository_id_fkey";
            columns: ["repository_id"];
            isOneToOne: false;
            referencedRelation: "repositories";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_contracts: {
        Row: {
          action_id: string;
          created_at: string;
          id: string;
          latest_version_id: string | null;
          name: string;
          org_id: string;
          site_id: string;
          status: string;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          id?: string;
          latest_version_id?: string | null;
          name: string;
          org_id: string;
          site_id: string;
          status?: string;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          id?: string;
          latest_version_id?: string | null;
          name?: string;
          org_id?: string;
          site_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_contracts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_contracts_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_events: {
        Row: {
          created_at: string;
          data: Json;
          event: string;
          id: number;
          org_id: string;
          site_id: string;
        };
        Insert: {
          created_at?: string;
          data?: Json;
          event: string;
          id?: never;
          org_id: string;
          site_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json;
          event?: string;
          id?: never;
          org_id?: string;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          delivery_id: string;
          event: string;
          received_at: string;
        };
        Insert: {
          delivery_id: string;
          event: string;
          received_at?: string;
        };
        Update: {
          delivery_id?: string;
          event?: string;
          received_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_candidate: {
        Args: { p_candidate_id: string; p_site_id: string };
        Returns: string;
      };
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      enqueue_job: { Args: { p_message: Json }; Returns: number };
      get_agent_analytics: {
        Args: { p_days?: number; p_site_id: string };
        Returns: Json;
      };
      request_push_analysis: {
        Args: {
          p_commit_sha: string;
          p_delivery_id: string;
          p_github_repo_id: number;
          p_installation_id: number;
          p_ref: string;
        };
        Returns: Json;
      };
      publish_manifest: {
        Args: {
          p_action?: string;
          p_manifest: Json;
          p_performed_by: string;
          p_signed: Json;
          p_site_id: string;
          p_source_manifest_id?: string;
        };
        Returns: string;
      };
      request_analysis: {
        Args: {
          p_commit_sha: string;
          p_ref?: string;
          p_repository_id: string;
        };
        Returns: string;
      };
      set_candidates_enabled: {
        Args: {
          p_candidate_ids: string[];
          p_enabled: boolean;
          p_site_id: string;
        };
        Returns: number;
      };
    };
    Enums: {
      analysis_stage: "clone" | "static" | "crawl" | "synthesize" | "validate";
      candidate_status:
        "proposed" | "needs_review" | "approved" | "rejected" | "published";
      manifest_status: "draft" | "published" | "superseded" | "rolled_back";
      org_role: "owner" | "admin" | "member";
      risk_level:
        | "read_only"
        | "reversible"
        | "state_changing"
        | "destructive"
        | "financial";
      run_status: "queued" | "running" | "succeeded" | "failed" | "canceled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      analysis_stage: ["clone", "static", "crawl", "synthesize", "validate"],
      candidate_status: [
        "proposed",
        "needs_review",
        "approved",
        "rejected",
        "published",
      ],
      manifest_status: ["draft", "published", "superseded", "rolled_back"],
      org_role: ["owner", "admin", "member"],
      risk_level: [
        "read_only",
        "reversible",
        "state_changing",
        "destructive",
        "financial",
      ],
      run_status: ["queued", "running", "succeeded", "failed", "canceled"],
    },
  },
} as const;
