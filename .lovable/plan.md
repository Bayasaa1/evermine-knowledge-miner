# Knowledge map: Project → Videos → Topics → Detailed part

## What's wrong now

The "gremix mind" map puts all 140 topics around the project at once, and every one shows its name. Most topics appear in only one video, so you get a pile of overlapping bubbles and text. You can't tell which topic belongs to which video.

## New order (4 steps, one at a time)

```text
gremix mind (project)
  └─ 26 videos (thumbnails)
       └─ that video's topics (about 5-8)
            └─ Detailed part: explanation, clip, subtitles, voice, face
```

1. **Project:** the center shows the project. Around it are its **videos** as small thumbnail bubbles with short titles. Past 30 videos, the rest go into "+N more videos", which opens a searchable list.
2. **Video:** tap a video to see only **its topics** around it, usually 5-8. The names are readable and nothing overlaps.
3. **Topic → Detailed part:** tap a topic to open a side panel with:
   - **Explanation:** what the creator said or did about this topic, in plain words, from the mined result.
   - **Clip:** plays the exact moment in the video (start to end time), with **subtitles** in the language you picked.
   - **Voice clone:** "Hear it in his voice" reads the explanation using the persona's cloned voice, if one is set up. If not, it shows "Set up voice clone" instead.
   - **Face clone:** "See him explain it" shows the persona's face clone speaking, if one is set up. If not, it shows "Set up face clone".
   - **Ask about this:** opens chat with the mind, already on this topic.
   - Also appears in: the other videos that share this topic.
4. **Back steps:** a breadcrumb (gremix mind › video › topic) lets you go back one level at a time.
5. **Readable always:** at most about 30 bubbles on screen, names only on big bubbles or the one you point at, and more space between them.

Nothing about your videos or minds changes. This only changes how the map shows them.

## Check

On gremix mind: the first view shows the videos. Tapping a video shows only its topics. Tapping a topic plays the right clip with subtitles, and the voice and face buttons work (or show the setup message).

## Technical details

- `knowledge-graph.ts` `buildProjectGraph`: level "project" shows videos (cap 30 plus an overflow list). Level "video" shows that video's concepts. The topic cluster level is replaced by a "topic" detail panel.
- `knowledge-graph.tsx`: new level flow and breadcrumb. Thumbnail nodes use youtube_id images. Labels only when hovered, for top nodes, or when zoomed in. Stronger repulsion.
- New `TopicDetail` panel: get the topic's segment and explanation from the video's mined timeline (`project_content.timeline`) and mind vault result. Clip through the existing youtube-stage player with start/end and the subtitle language. Voice through the existing `/api/mind-voice` with the persona's voice clone (`persona_clones`). Face through `/api/mind-face` / clone-studio when a face clone exists. Chat through the talk-to-mind modal with a topic prompt.
- AI calls run on the user's own keys only. No Lovable credits.
- EN/MN/KO copy. No data changes.
