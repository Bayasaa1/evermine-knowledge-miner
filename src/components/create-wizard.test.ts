import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVideo } from "./create-wizard";

test("accepts mp4, mov and webm", () => {
  assert.equal(validateVideo("video/mp4", "a.mp4", 1000, 60), null);
  assert.equal(validateVideo("", "a.mov", 1000), null);
});
test("rejects other types", () => assert.equal(validateVideo("video/x-msvideo", "a.avi", 1000), "badType"));
test("rejects files over 1 GB", () => assert.equal(validateVideo("video/mp4", "a.mp4", 1024 ** 3 + 1), "tooBig"));
test("rejects videos over 6 hours", () => assert.equal(validateVideo("video/mp4", "a.mp4", 1000, 6 * 3600 + 1), "tooLong"));
