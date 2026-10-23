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
    PostgrestVersion: "14.15"
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
      chat_room_members: {
        Row: {
          display_name: string
          id: string
          joined_at: string
          last_read_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          display_name?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          display_name?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_messages: {
        Row: {
          attachment: Json | null
          author_name: string
          body: string
          created_at: string
          id: string
          mind_id: string | null
          moderator_pending: boolean
          reply_to_id: string | null
          room_id: string
          sender_kind: string
          sender_user_id: string
          shared_url: string | null
        }
        Insert: {
          attachment?: Json | null
          author_name?: string
          body: string
          created_at?: string
          id?: string
          mind_id?: string | null
          moderator_pending?: boolean
          reply_to_id?: string | null
          room_id: string
          sender_kind?: string
          sender_user_id: string
          shared_url?: string | null
        }
        Update: {
          attachment?: Json | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id?: string | null
          moderator_pending?: boolean
          reply_to_id?: string | null
          room_id?: string
          sender_kind?: string
          sender_user_id?: string
          shared_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_minds: {
        Row: {
          added_by: string
          created_at: string
          id: string
          mind_id: string
          mind_name: string
          role: string
          room_id: string
          sort: number
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          mind_id: string
          mind_name?: string
          role?: string
          room_id: string
          sort?: number
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          mind_id?: string
          mind_name?: string
          role?: string
          room_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_minds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          active_mind_id: string | null
          avatar_path: string | null
          created_at: string
          debate_mode: string
          id: string
          invite_code: string
          invite_enabled: boolean
          kind: string
          moderator_mode: boolean
          owner_id: string
          title: string
          turn_limit: number
          turn_started_at: string | null
          turn_token: string | null
          updated_at: string
        }
        Insert: {
          active_mind_id?: string | null
          avatar_path?: string | null
          created_at?: string
          debate_mode?: string
          id?: string
          invite_code?: string
          invite_enabled?: boolean
          kind?: string
          moderator_mode?: boolean
          owner_id: string
          title?: string
          turn_limit?: number
          turn_started_at?: string | null
          turn_token?: string | null
          updated_at?: string
        }
        Update: {
          active_mind_id?: string | null
          avatar_path?: string | null
          created_at?: string
          debate_mode?: string
          id?: string
          invite_code?: string
          invite_enabled?: boolean
          kind?: string
          moderator_mode?: boolean
          owner_id?: string
          title?: string
          turn_limit?: number
          turn_started_at?: string | null
          turn_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "user_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_personas: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          greeting: string
          handle: string
          id: string
          is_active: boolean
          name: string
          social_links: Json
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          greeting?: string
          handle?: string
          id?: string
          is_active?: boolean
          name?: string
          social_links?: Json
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          greeting?: string
          handle?: string
          id?: string
          is_active?: boolean
          name?: string
          social_links?: Json
          tags?: string[]
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
      mind_qa: {
        Row: {
          answer: string
          created_at: string
          id: string
          project_id: string
          question: string
          sort: number
          suggest: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string
          created_at?: string
          id?: string
          project_id: string
          question: string
          sort?: number
          suggest?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          project_id?: string
          question?: string
          sort?: number
          suggest?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mind_qa_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          branch_name: string
          created_at: string
          created_by_engine: string
          id: string
          is_active: boolean
          mind_id: string
          parent_version_id: string | null
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
          branch_name?: string
          created_at?: string
          created_by_engine?: string
          id?: string
          is_active?: boolean
          mind_id?: string
          parent_version_id?: string | null
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
          branch_name?: string
          created_at?: string
          created_by_engine?: string
          id?: string
          is_active?: boolean
          mind_id?: string
          parent_version_id?: string | null
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
            foreignKeyName: "mind_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "mind_versions"
            referencedColumns: ["id"]
          },
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
      post_comments: {
        Row: {
          author_avatar: string | null
          author_name: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          parent_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_avatar?: string | null
          author_name?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "user_posts"
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
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          username?: string | null
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
          sequence_index: number
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
          sequence_index?: number
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
          sequence_index?: number
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
          exclusive: boolean
          id: string
          key_id: string | null
          key_tail: string | null
          provider: string
          role: string
          team_key_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_fallback?: boolean
          exclusive?: boolean
          id?: string
          key_id?: string | null
          key_tail?: string | null
          provider: string
          role: string
          team_key_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_fallback?: boolean
          exclusive?: boolean
          id?: string
          key_id?: string | null
          key_tail?: string | null
          provider?: string
          role?: string
          team_key_ids?: string[]
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
      user_blocks: {
        Row: {
          blocked_user_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
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
      user_posts: {
        Row: {
          author_avatar: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          media_kind: string
          media_path: string | null
          user_id: string
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          media_kind?: string
          media_path?: string | null
          user_id: string
        }
        Update: {
          author_avatar?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          media_kind?: string
          media_path?: string | null
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
      user_stories: {
        Row: {
          author_avatar: string | null
          author_name: string
          caption: string
          created_at: string
          expires_at: string
          id: string
          media_kind: string
          media_path: string
          user_id: string
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string
          caption?: string
          created_at?: string
          expires_at?: string
          id?: string
          media_kind?: string
          media_path: string
          user_id: string
        }
        Update: {
          author_avatar?: string | null
          author_name?: string
          caption?: string
          created_at?: string
          expires_at?: string
          id?: string
          media_kind?: string
          media_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscriber_id: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscriber_id: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscriber_id?: string
          target_user_id?: string
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
      add_room_friend: {
        Args: { _friend: string; _room: string }
        Returns: undefined
      }
      author_is_banned: { Args: { _user_id: string }; Returns: boolean }
      block_user: { Args: { _other: string }; Returns: boolean }
      claim_room_turn: {
        Args: { _message: string; _mind: string; _room: string }
        Returns: string
      }
      complete_room_question: {
        Args: { _message: string; _room: string }
        Returns: undefined
      }
      finish_room_turn: {
        Args: {
          _body?: string
          _message: string
          _room: string
          _token: string
        }
        Returns: undefined
      }
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
      is_blocked_between: { Args: { _a: string; _b: string }; Returns: boolean }
      is_mutual: { Args: { _a: string; _b: string }; Returns: boolean }
      is_room_admin: {
        Args: { _room: string; _user: string }
        Returns: boolean
      }
      is_room_member: {
        Args: { _room: string; _user: string }
        Returns: boolean
      }
      join_room_by_code: {
        Args: { _code: string; _name: string }
        Returns: string
      }
      my_duplicate_persona_ids: { Args: never; Returns: string[] }
      open_dm: { Args: { _other: string }; Returns: string }
      persona_handle_taken: {
        Args: { _exclude_id?: string; _handle: string }
        Returns: boolean
      }
      rename_mind_branch: {
        Args: { _branch_name: string; _version_id: string }
        Returns: boolean
      }
      rollback_mind_version: {
        Args: { _version_id: string }
        Returns: {
          vault_id: string
          version: string
        }[]
      }
      save_mind_branch: {
        Args: {
          _branch_name?: string
          _engine?: string
          _mind_id?: string
          _parent_version_id?: string
          _payload: Json
          _release_notes?: string
          _title: string
          _vault_id: string
        }
        Returns: {
          version: string
          version_id: string
          version_num: number
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
      set_room_member_role: {
        Args: { _member: string; _role: string }
        Returns: boolean
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
