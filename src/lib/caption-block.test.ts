import { test } from "node:test";
import assert from "node:assert/strict";
import { isCaptionBlockPage } from "./youtube-captions.server";

test("429 from YouTube counts as blocked", () => {
  assert.equal(isCaptionBlockPage(429, "text/plain", ""), true);
});

test("HTML captcha page counts as blocked", () => {
  assert.equal(isCaptionBlockPage(200, "text/html", "<html>unusual traffic</html>"), true);
});

test("real json3 subtitles are not blocked", () => {
  assert.equal(isCaptionBlockPage(200, "application/json", '{"events":[]}'), false);
});
