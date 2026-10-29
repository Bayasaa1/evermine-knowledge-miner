import { describe, expect, test } from "bun:test";
import { encodeWav, frameTimes, planWindows } from "./video-extract";

describe("uploaded video parts", () => {
  test("a 12-minute video becomes 5 + 5 + 2 minute parts", () => {
    expect(planWindows(720).map((w) => [w.startSec, w.endSec])).toEqual([[0, 300], [300, 600], [600, 720]]);
  });
  test("frames stay inside their part", () => {
    const t = frameTimes({ index: 1, startSec: 300, endSec: 600 }, 24);
    expect(t.length).toBe(24);
    expect(Math.min(...t)).toBeGreaterThan(300);
    expect(Math.max(...t)).toBeLessThan(600);
  });
  test("WAV has a 44-byte header plus 2 bytes per sample", () => {
    expect(encodeWav(new Float32Array(100), 12000).length).toBe(244);
  });
});
