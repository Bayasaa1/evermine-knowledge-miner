# Remove YouTube overlays from feed videos

## What is happening

When a YouTube video is paused, YouTube draws its own share button, “More videos” recommendations, thumbnail, logo, and playback controls inside the embedded player. Evermind’s pause button currently sits above that layer, so both sets of controls cover the video.

## Fix

- Keep the YouTube player non-interactive so taps continue to use Evermind’s controls.
- When a video is paused, cover the embedded YouTube surface completely with the video’s clean thumbnail and show only Evermind’s play button.
- Keep Evermind’s subtitles, subtitle settings, Like, Chat, Reviews, and creator details above that clean paused view.
- Prevent YouTube’s end screen from appearing at the loop boundary by restarting playback through the player state callback instead of exposing recommendations.
- Preserve the current sound, pause/resume, subtitle timing, and live-voice behavior.

## Validation

- Test on the current mobile size while playing, paused, resumed, and after reaching the end.
- Confirm “More videos,” Share, YouTube controls, and YouTube recommendation thumbnails never cover the feed.
- Confirm Evermind’s play/pause, subtitles, sound, and scrolling still work.
