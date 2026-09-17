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
      activity_logs: {
        Row: {
          created_at: string
          detail: string
          event: string
          id: string
          ip: string | null
          suspicious: boolean
          tokens: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string
          event: string
          id?: string
          ip?: string | null
          suspicious?: boolean
          tokens?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string
          event?: string
          id?: string
          ip?: string | null
          suspicious?: boolean
          tokens?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          char_count: number
          created_at: string
          error_code: string | null
          estimated_cost_usd: number
          free_tier: boolean
          id: string
          input_tokens: number
          job_id: string
          key_id: string | null
          key_tail: string | null
          model: string
          output_tokens: number
          provider: string
          role: string
          status: string
          subject_id: string
          subject_kind: string
          subject_label: string
          user_id: string
        }
        Insert: {
          char_count?: number
          created_at?: string
          error_code?: string | null
          estimated_cost_usd?: number
          free_tier?: boolean
          id?: string
          input_tokens?: number
          job_id?: string
          key_id?: string | null
          key_tail?: string | null
          model?: string
          output_tokens?: number
          provider?: string
          role?: string
          status?: string
          subject_id?: string
          subject_kind?: string
          subject_label?: string
          user_id: string
        }
        Update: {
          char_count?: number
          created_at?: string
          error_code?: string | null
          estimated_cost_usd?: number
          free_tier?: boolean
          id?: string
          input_tokens?: number
          job_id?: string
          key_id?: string | null
          key_tail?: string | null
          model?: string
          output_tokens?: number
          provider?: string
          role?: string
          status?: string
          subject_id?: string
          subject_kind?: string
          subject_label?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          lang: string
          mind_id: string
          role: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lang?: string
          mind_id: string
          role: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lang?: string
          mind_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_personas: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          handle: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_updates: {
        Row: {
          body: string
          created_at: string
          creator_user_id: string
          id: string
          kind: string
          mind_id: string | null
          project_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          creator_user_id: string
          id?: string
          kind: string
          mind_id?: string | null
          project_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          creator_user_id?: string
          id?: string
          kind?: string
          mind_id?: string | null
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_minds: {
        Row: {
          created_at: string
          featured_by: string | null
          mind_id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          featured_by?: string | null
          mind_id: string
          note?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          featured_by?: string | null
          mind_id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      graph_links: {
        Row: {
          created_at: string
          id: string
          label: string
          persona_id: string | null
          source_key: string
          target_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          persona_id?: string | null
          source_key: string
          target_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          persona_id?: string | null
          source_key?: string
          target_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_links_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_comments: {
        Row: {
          author_name: string
          body: string
          created_at: string
          id: string
          mind_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name?: string
          body: string
          created_at?: string
          id?: string
          mind_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mind_purchases: {
        Row: {
          category: string
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          mind_id: string
          plan: string
          price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          mind_id: string
          plan?: string
          price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          mind_id?: string
          plan?: string
          price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mind_reviews: {
        Row: {
          author_name: string
          body: string
          created_at: string
          id: string
          mind_id: string
          paid_owner: boolean
          rating: number
          updated_at: string
          user_id: string
          verified_deployment: boolean
          video_proof_url: string | null
        }
        Insert: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id: string
          paid_owner?: boolean
          rating: number
          updated_at?: string
          user_id: string
          verified_deployment?: boolean
          video_proof_url?: string | null
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id?: string
          paid_owner?: boolean
          rating?: number
          updated_at?: string
          user_id?: string
          verified_deployment?: boolean
          video_proof_url?: string | null
        }
        Relationships: []
      }
      mind_specs: {
        Row: {
          accuracy_score: number
          changelog_notes: string
          compatibility: string[]
          created_at: string
          id: string
          last_updated_at: string
          mind_id: string
          resolved_review_ids: string[]
          training_hours: number
          updated_at: string
          user_id: string
          version: string
        }
        Insert: {
          accuracy_score?: number
          changelog_notes?: string
          compatibility?: string[]
          created_at?: string
          id?: string
          last_updated_at?: string
          mind_id: string
          resolved_review_ids?: string[]
          training_hours?: number
          updated_at?: string
          user_id: string
          version?: string
        }
        Update: {
          accuracy_score?: number
          changelog_notes?: string
          compatibility?: string[]
          created_at?: string
          id?: string
          last_updated_at?: string
          mind_id?: string
          resolved_review_ids?: string[]
          training_hours?: number
          updated_at?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      mind_vaults: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          persona_id: string | null
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          persona_id?: string | null
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          persona_id?: string | null
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mind_vaults_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mind_vaults_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_versions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mind_id: string
          payload: Json
          release_notes: string
          title: string
          updated_at: string
          user_id: string
          vault_id: string
          version: string
          version_num: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mind_id?: string
          payload?: Json
          release_notes?: string
          title?: string
          updated_at?: string
          user_id: string
          vault_id: string
          version?: string
          version_num?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mind_id?: string
          payload?: Json
          release_notes?: string
          title?: string
          updated_at?: string
          user_id?: string
          vault_id?: string
          version?: string
          version_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "mind_versions_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "mind_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_jobs: {
        Row: {
          ai_credential: string | null
          attempts: number
          category: string
          chunks: Json
          content_kind: string
          created_at: string
          custom_instructions: string
          id: string
          last_error: string | null
          next_index: number
          persona_id: string | null
          playlist_id: string | null
          primary_focus: string
          project_id: string | null
          publish_to_feed: boolean
          queue_position: number
          results: Json
          retry_after: string | null
          source_kind: string
          source_label: string
          source_url: string
          status: string
          total_chunks: number
          updated_at: string
          user_id: string
          vault_id: string | null
          video_context: string
        }
        Insert: {
          ai_credential?: string | null
          attempts?: number
          category?: string
          chunks?: Json
          content_kind?: string
          created_at?: string
          custom_instructions?: string
          id?: string
          last_error?: string | null
          next_index?: number
          persona_id?: string | null
          playlist_id?: string | null
          primary_focus?: string
          project_id?: string | null
          publish_to_feed?: boolean
          queue_position?: number
          results?: Json
          retry_after?: string | null
          source_kind?: string
          source_label?: string
          source_url: string
          status?: string
          total_chunks?: number
          updated_at?: string
          user_id: string
          vault_id?: string | null
          video_context?: string
        }
        Update: {
          ai_credential?: string | null
          attempts?: number
          category?: string
          chunks?: Json
          content_kind?: string
          created_at?: string
          custom_instructions?: string
          id?: string
          last_error?: string | null
          next_index?: number
          persona_id?: string | null
          playlist_id?: string | null
          primary_focus?: string
          project_id?: string | null
          publish_to_feed?: boolean
          queue_position?: number
          results?: Json
          retry_after?: string | null
          source_kind?: string
          source_label?: string
          source_url?: string
          status?: string
          total_chunks?: number
          updated_at?: string
          user_id?: string
          vault_id?: string | null
          video_context?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_jobs_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mining_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_clones: {
        Row: {
          consent: boolean
          consent_at: string | null
          created_at: string
          engine: string
          error: string | null
          id: string
          kind: string
          persona_id: string
          remote_id: string | null
          samples: Json
          settings: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consent?: boolean
          consent_at?: string | null
          created_at?: string
          engine?: string
          error?: string | null
          id?: string
          kind: string
          persona_id: string
          remote_id?: string | null
          samples?: Json
          settings?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consent?: boolean
          consent_at?: string | null
          created_at?: string
          engine?: string
          error?: string | null
          id?: string
          kind?: string
          persona_id?: string
          remote_id?: string | null
          samples?: Json
          settings?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_clones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_concepts: {
        Row: {
          concept: string
          content_ids: string[]
          count: number
          created_at: string
          id: string
          kind: string
          label: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          concept: string
          content_ids?: string[]
          count?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          concept?: string
          content_ids?: string[]
          count?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_concepts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_content: {
        Row: {
          category: string
          created_at: string
          description: string
          emotion_timeline: Json
          id: string
          kind: string
          mind_id: string
          project_id: string
          source_url: string
          tags: string[]
          timeline: Json
          title: string
          transcript: Json
          updated_at: string
          user_id: string
          view_count: number
          youtube_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          emotion_timeline?: Json
          id?: string
          kind?: string
          mind_id?: string
          project_id: string
          source_url?: string
          tags?: string[]
          timeline?: Json
          title?: string
          transcript?: Json
          updated_at?: string
          user_id: string
          view_count?: number
          youtube_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          emotion_timeline?: Json
          id?: string
          kind?: string
          mind_id?: string
          project_id?: string
          source_url?: string
          tags?: string[]
          timeline?: Json
          title?: string
          transcript?: Json
          updated_at?: string
          user_id?: string
          view_count?: number
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_content_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          ai_level_default: number
          ai_level_max: number
          chat_access: string
          cover_url: string | null
          created_at: string
          creator_avatar_url: string | null
          creator_name: string
          currency: string
          description: string
          id: string
          persona_id: string | null
          plan_tiers: Json
          price: number
          published: boolean
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          ai_level_default?: number
          ai_level_max?: number
          chat_access?: string
          cover_url?: string | null
          created_at?: string
          creator_avatar_url?: string | null
          creator_name?: string
          currency?: string
          description?: string
          id?: string
          persona_id?: string | null
          plan_tiers?: Json
          price?: number
          published?: boolean
          title?: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          ai_level_default?: number
          ai_level_max?: number
          chat_access?: string
          cover_url?: string | null
          created_at?: string
          creator_avatar_url?: string | null
          creator_name?: string
          currency?: string
          description?: string
          id?: string
          persona_id?: string | null
          plan_tiers?: Json
          price?: number
          published?: boolean
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      robot_packages: {
        Row: {
          created_at: string
          deploy_token: string
          id: string
          mind_id: string
          package: Json
          published: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deploy_token?: string
          id?: string
          mind_id: string
          package?: Json
          published?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deploy_token?: string
          id?: string
          mind_id?: string
          package?: Json
          published?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      update_reads: {
        Row: {
          id: string
          read_at: string
          update_id: string
          user_id: string
        }
        Insert: {
          id?: string
          read_at?: string
          update_id: string
          user_id: string
        }
        Update: {
          id?: string
          read_at?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "update_reads_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "creator_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_keys: {
        Row: {
          api_key: string
          cooldown_until: string | null
          cost_kind: string
          created_at: string
          enabled: boolean
          endpoint: string | null
          id: string
          label: string
          model: string | null
          monthly_limit_usd: number
          provider: string
          rank: number
          spend_usd: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          cooldown_until?: string | null
          cost_kind?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string | null
          id?: string
          label?: string
          model?: string | null
          monthly_limit_usd?: number
          provider: string
          rank?: number
          spend_usd?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          cooldown_until?: string | null
          cost_kind?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string | null
          id?: string
          label?: string
          model?: string | null
          monthly_limit_usd?: number
          provider?: string
          rank?: number
          spend_usd?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ai_roles: {
        Row: {
          auto_fallback: boolean
          id: string
          key_id: string | null
          key_tail: string | null
          provider: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_fallback?: boolean
          id?: string
          key_id?: string | null
          key_tail?: string | null
          provider: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_fallback?: boolean
          id?: string
          key_id?: string | null
          key_tail?: string | null
          provider?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ai_roles_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "user_ai_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flags: {
        Row: {
          ban_reason: string
          banned: boolean
          created_at: string
          unlimited_quota: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ban_reason?: string
          banned?: boolean
          created_at?: string
          unlimited_quota?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ban_reason?: string
          banned?: boolean
          created_at?: string
          unlimited_quota?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      viewer_brains: {
        Row: {
          created_at: string
          creator_user_id: string | null
          id: string
          last_seen_at: string | null
          mind_id: string
          payload: Json
          project_id: string | null
          sessions: number
          shared_with_creator: boolean
          talk_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          creator_user_id?: string | null
          id?: string
          last_seen_at?: string | null
          mind_id: string
          payload?: Json
          project_id?: string | null
          sessions?: number
          shared_with_creator?: boolean
          talk_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          creator_user_id?: string | null
          id?: string
          last_seen_at?: string | null
          mind_id?: string
          payload?: Json
          project_id?: string | null
          sessions?: number
          shared_with_creator?: boolean
          talk_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viewer_brains_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      viewer_signals: {
        Row: {
          body: string
          created_at: string
          creator_reply: string | null
          creator_user_id: string | null
          id: string
          kind: string
          mind_id: string
          read_by_creator: boolean
          status: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          creator_reply?: string | null
          creator_user_id?: string | null
          id?: string
          kind: string
          mind_id: string
          read_by_creator?: boolean
          status?: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          creator_reply?: string | null
          creator_user_id?: string | null
          id?: string
          kind?: string
          mind_id?: string
          read_by_creator?: boolean
          status?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_published_mind_package: {
        Args: { _token: string }
        Returns: {
          mind_id: string
          package: Json
          title: string
          updated_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      rollback_mind_version: {
        Args: { _version_id: string }
        Returns: {
          vault_id: string
          version: string
        }[]
      }
      save_mind_version: {
        Args: {
          _mind_id?: string
          _payload: Json
          _release_notes?: string
          _title: string
          _vault_id: string
        }
        Returns: {
          vault_id: string
          version: string
          version_id: string
          version_num: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
