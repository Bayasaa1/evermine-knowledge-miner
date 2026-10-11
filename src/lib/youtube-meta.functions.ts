/**
 * Zero-touch onboarding: the moment a YouTube link is pasted, the server pulls
 * the public metadata (title, description, publish date, duration, thumbnail,
 * channel) so the creator never types anything that already exists.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDuration, type VideoMetadata } from "@/lib/mining-jobs";

const schema = z.object({ url: z.string().min(5).max(2_048) });

export const getYoutubeMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }): Promise<VideoMetadata | null> => {
    const { youtubeId, youtubePlaylistId } = await import("@/lib/import-sources");
    const { fetchVideoDetails, fetchPlaylistVideos } = await import("@/lib/youtube-meta.server");

    let id = youtubeId(data.url);
    const list = youtubePlaylistId(data.url);
    let playlistCount: number | undefined;
    let playlistItems: VideoMetadata["playlistItems"];
    if (list) {
      const items = await fetchPlaylistVideos(list, 50);
      if (items.length > 0) {
        playlistCount = items.length;
        playlistItems = items;
      }
      if (!id) id = items[0]?.videoId ?? null;
    }
    if (!id) return null;

    const d = await fetchVideoDetails(id);
    return {
      videoId: d.videoId,
      url: d.url,
      title: d.title,
      description: d.description,
      publishedAt: d.publishedAt,
      durationSec: d.durationSec,
      durationLabel: formatDuration(d.durationSec),
      thumbnail: d.thumbnail,
      channel: d.channel,
      playlistCount,
      playlistItems,
    };
  });
