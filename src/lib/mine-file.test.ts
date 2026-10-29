import { expect, test } from "bun:test";
import { chunkWindow, formatChunkPayload, nativeVideoId, videoIdFor } from "./mine-file";

test("native ids are native_ + cleaned seed", () => {
  expect(nativeVideoId("AB-12-cd")).toBe("native_ab12cd");
  expect(videoIdFor("youtube", "dQw4w9WgXcQ", "x")).toBe("dQw4w9WgXcQ");
  expect(videoIdFor("camera_record", null, "abc")).toBe("native_abc");
});

test("12-minute video: third chunk is 600-720s, fourth is none", () => {
  expect(chunkWindow(720, 2)).toEqual({ index: 2, startSec: 600, endSec: 720, totalChunks: 3 });
  expect(chunkWindow(720, 3)).toBeNull();
});

test("payload keeps only in-window frames, sorted", () => {
  const p = formatChunkPayload({ index: 0, startSec: 0, endSec: 300, frames: [{ t: 200, jpeg: "b" }, { t: 10, jpeg: "a" }, { t: 400, jpeg: "z" }], audioWav: "" }, 2);
  expect(p.keyframes.map((k) => k.timestampSec)).toEqual([10, 200]);
  expect(p.audioBase64).toBeNull();
  expect(p.totalChunks).toBe(2);
});
