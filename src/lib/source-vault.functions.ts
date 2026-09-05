/**
 * Step 2 of the creator flow is a *library* step, not a mining step.
 *
 * The moment a creator pastes a link, every video behind it (a single video or
 * a whole playlist) is stored in "Saved Minds" together with everything that
 * describes it — title, description, thumbnail, channel, publish date and
 * playtime. Nothing is analysed yet: mining happens later, in step 3, from the
 * saved entries.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDuration } from "@/lib/mining-jobs";

export type SavedSource = {
  id: string;
  title: string;
  videoId: string;
  url: string;
  thumbnail: string;
  description: string;
  channel: string;
  publishedAt: string;
  durationSec: number;
  durationLabel: string;
  status: "pending" | "mined";
};

/** Shape stored in `mind_vaults.payload` for a saved (not yet mined) source. */
export type SourcePayload = {
  kind: "source";
  status: "pending" | "mined";
  source: { kind: "youtube" | "drive"; url: string; label: string };
  video: {
    videoId: string;
    url: string;
    title: string;
    description: string;
    channel: string;
    publishedAt: string;
    durationSec: number;
    durationLabel: string;
    thumbnail: string;
  };
  playlistId?: string | null;
  savedAt: string;
};

const saveSchema = z.object({
  url: z.string().trim().min(5).max(2_048),
  personaId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/** Saves a pasted link (or every video of a playlist) into Saved Minds. */
export const saveSourcesToVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ saved: SavedSource[]; skipped: number }> => {
    const { youtubeId, youtubePlaylistId, driveFileId } = await import("@/lib/import-sources");
    const { fetchPlaylistVideoIds, fetchVideoDetails } = await import("@/lib/youtube-meta.server");

    const list = youtubePlaylistId(data.url);
    const single = youtubeId(data.url);
    const drive = driveFileId(data.url);

    let ids: string[] = [];
    if (list) ids = await fetchPlaylistVideoIds(list, data.limit ?? 50);
    else if (single) ids = [single];

    if (ids.length === 0 && !drive) throw new Error("That link is not a YouTube video, playlist or Google Drive file.");

    // Everything the creator already saved — pasting the same playlist twice
    // must not create duplicates.
    const { data: existingRows } = await context.supabase
      .from("mind_vaults")
      .select("id, payload")
      .eq("user_id", context.userId)
      .eq("kind", "source");
    const known = new Set(
      (existingRows ?? [])
        .map((r) => (r.payload as { video?: { videoId?: string }; source?: { url?: string } } | null))
        .map((p) => p?.video?.videoId || p?.source?.url || "")
        .filter(Boolean),
    );

    const payloads: SourcePayload[] = [];
    let skipped = 0;

    if (ids.length > 0) {
      for (const id of ids) {
        if (known.has(id)) {
          skipped += 1;
          continue;
        }
        const d = await fetchVideoDetails(id);
        payloads.push({
          kind: "source",
          status: "pending",
          source: { kind: "youtube", url: d.url, label: d.title || d.url },
          video: {
            videoId: d.videoId,
            url: d.url,
            title: d.title,
            description: d.description,
            channel: d.channel,
            publishedAt: d.publishedAt,
            durationSec: d.durationSec,
            durationLabel: formatDuration(d.durationSec),
            thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${d.videoId}/hqdefault.jpg`,
          },
          playlistId: list,
          savedAt: new Date().toISOString(),
        });
      }
    } else if (drive) {
      const url = `https://drive.google.com/uc?export=download&id=${drive}`;
      if (known.has(url)) skipped += 1;
      else
        payloads.push({
          kind: "source",
          status: "pending",
          source: { kind: "drive", url, label: data.url.trim() },
          video: {
            videoId: "",
            url,
            title: data.url.trim(),
            description: "",
            channel: "",
            publishedAt: "",
            durationSec: 0,
            durationLabel: "",
            thumbnail: "",
          },
          playlistId: null,
          savedAt: new Date().toISOString(),
        });
    }

    if (payloads.length === 0) return { saved: [], skipped };

    const { data: inserted, error } = await context.supabase
      .from("mind_vaults")
      .insert(
        payloads.map((p) => ({
          user_id: context.userId,
          title: (p.video.title || p.source.label).slice(0, 200),
          kind: "source",
          payload: p as never,
          persona_id: data.personaId ?? null,
          project_id: data.projectId ?? null,
        })),
      )
      .select("id, payload");
    if (error) throw new Error(error.message);

    return {
      saved: (inserted ?? []).map((r) => {
        const p = r.payload as unknown as SourcePayload;
        return {
          id: r.id,
          title: p.video.title || p.source.label,
          videoId: p.video.videoId,
          url: p.video.url,
          thumbnail: p.video.thumbnail,
          description: p.video.description,
          channel: p.video.channel,
          publishedAt: p.video.publishedAt,
          durationSec: p.video.durationSec,
          durationLabel: p.video.durationLabel,
          status: p.status,
        };
      }),
      skipped,
    };
  });

/** Marks a saved source as mined (or back to pending) after the pipeline runs. */
export const markSourceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "pending" | "mined" }) => {
    if (!input?.id) throw new Error("A saved source id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error: readError } = await context.supabase
      .from("mind_vaults")
      .select("payload")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) return { ok: false };
    const payload = { ...(row.payload as object), status: data.status };
    const { error } = await context.supabase
      .from("mind_vaults")
      .update({ payload: payload as never })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
