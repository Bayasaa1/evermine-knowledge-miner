import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PostComment = Database["public"]["Tables"]["post_comments"]["Row"];
export type CommentLike = Pick<Database["public"]["Tables"]["comment_likes"]["Row"], "comment_id" | "user_id">;

export function commentForest(rows: PostComment[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, PostComment[]>();
  const roots: PostComment[] = [];
  for (const row of rows) {
    if (row.parent_id && byId.has(row.parent_id)) {
      const siblings = children.get(row.parent_id) ?? [];
      siblings.push(row);
      children.set(row.parent_id, siblings);
    } else roots.push(row);
  }
  return { roots, children };
}

export async function listPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCommentLikes(postId: string): Promise<CommentLike[]> {
  const { data, error } = await supabase.from("comment_likes").select("comment_id,user_id").eq("post_id", postId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in first");
  return data.user.id;
}

export async function addPostComment(postId: string, content: string, parentId: string | null) {
  const userId = await currentUserId();
  const { error } = await supabase.from("post_comments").insert({ post_id: postId, user_id: userId, content: content.trim(), parent_id: parentId });
  if (error) throw new Error(error.message);
}

/** Keep the reply tree intact when its author removes a parent comment. */
export async function removePostComment(id: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from("post_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setCommentLiked(postId: string, commentId: string, liked: boolean) {
  const userId = await currentUserId();
  const result = liked
    ? await supabase.from("comment_likes").upsert({ comment_id: commentId, post_id: postId, user_id: userId }, { onConflict: "comment_id,user_id", ignoreDuplicates: true })
    : await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);
  if (result.error) throw new Error(result.error.message);
}