import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Publishes a compiled Mind Vault so robots can pull it over the air.
 * Every call runs as the signed-in creator, so RLS keeps packages isolated
 * per account; only the published package is readable by an anonymous robot.
 */

export type DeployedPackage = {
  mindId: string;
  title: string;
  token: string;
  published: boolean;
  updatedAt: string;
};

export const getDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string }) => {
    if (!input?.mindId) throw new Error("A mind id is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<DeployedPackage | null> => {
    const { data: row, error } = await context.supabase
      .from("robot_packages")
      .select("mind_id, title, deploy_token, published, updated_at")
      .eq("user_id", context.userId)
      .eq("mind_id", data.mindId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      mindId: row.mind_id,
      title: row.title,
      token: row.deploy_token,
      published: row.published,
      updatedAt: row.updated_at,
    };
  });

export const publishDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; title: string; pkg: unknown }) => {
    if (!input?.mindId) throw new Error("A mind id is required");
    if (!input.pkg || typeof input.pkg !== "object") throw new Error("A mind package is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<DeployedPackage> => {
    const { data: row, error } = await context.supabase
      .from("robot_packages")
      .upsert(
        {
          user_id: context.userId,
          mind_id: data.mindId,
          title: (data.title || "Untitled Mind").slice(0, 200),
          package: data.pkg as never,
          published: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,mind_id" },
      )
      .select("mind_id, title, deploy_token, published, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      mindId: row.mind_id,
      title: row.title,
      token: row.deploy_token,
      published: row.published,
      updatedAt: row.updated_at,
    };
  });

export const setDeploymentPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; published: boolean }) => {
    if (!input?.mindId) throw new Error("A mind id is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<void> => {
    const { error } = await context.supabase
      .from("robot_packages")
      .update({ published: data.published, updated_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("mind_id", data.mindId);
    if (error) throw new Error(error.message);
  });
