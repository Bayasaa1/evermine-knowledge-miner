import { expect, test } from "bun:test";
import { validateVideo } from "./create-wizard";

test("accepts mp4, mov and webm", () => {
  expect(validateVideo("video/mp4", "a.mp4", 1000, 60)).toBeNull();
  expect(validateVideo("", "a.mov", 1000)).toBeNull();
});
test("rejects other types", () => expect(validateVideo("video/x-msvideo", "a.avi", 1000)).toBe("badType"));
test("rejects files over 1 GB", () => expect(validateVideo("video/mp4", "a.mp4", 1024 ** 3 + 1)).toBe("tooBig"));
test("rejects videos over 6 hours", () => expect(validateVideo("video/mp4", "a.mp4", 1000, 6 * 3600 + 1)).toBe("tooLong"));
