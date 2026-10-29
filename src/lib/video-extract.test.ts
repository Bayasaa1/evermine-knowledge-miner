import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, frameTimes, planWindows } from "./video-extract";

describe("uploaded video parts", () => {
  test("a 12-minute video becomes 5 + 5 + 2 minute parts", () => {
    assert.deepEqual(planWindows(720).map((w) => [w.startSec, w.endSec]), [[0, 300], [300, 600], [600, 720]]);
  });
  test("frames stay inside their part", () => {
    const t = frameTimes({ index: 1, startSec: 300, endSec: 600 }, 24);
    assert.equal(t.length, 24);
    assert.ok(Math.min(...t) > 300);
    assert.ok(Math.max(...t) < 600);
  });
  test("WAV has a 44-byte header plus 2 bytes per sample", () => {
    assert.equal(encodeWav(new Float32Array(100), 12000).length, 244);
  });
});
