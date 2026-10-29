import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkWindow, formatChunkPayload, nativeVideoId, videoIdFor } from "./mine-file";

test("native ids are native_ + cleaned seed", () => {
  assert.equal(nativeVideoId("AB-12-cd"), "native_ab12cd");
  assert.equal(videoIdFor("youtube", "dQw4w9WgXcQ", "x"), "dQw4w9WgXcQ");
  assert.equal(videoIdFor("camera_record", null, "abc"), "native_abc");
});

test("12-minute video: third chunk is 600-720s, fourth is none", () => {
  assert.deepEqual(chunkWindow(720, 2), { index: 2, startSec: 600, endSec: 720, totalChunks: 3 });
  assert.equal(chunkWindow(720, 3), null);
});

test("payload keeps only in-window frames, sorted", () => {
  const p = formatChunkPayload({ index: 0, startSec: 0, endSec: 300, frames: [{ t: 200, jpeg: "b" }, { t: 10, jpeg: "a" }, { t: 400, jpeg: "z" }], audioWav: "" }, 2);
  assert.deepEqual(p.keyframes.map((k) => k.timestampSec), [10, 200]);
  assert.equal(p.audioBase64, null);
  assert.equal(p.totalChunks, 2);
});
