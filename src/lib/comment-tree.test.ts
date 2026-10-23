import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commentForest } from "./comment-tree";

describe("comment replies", () => {
  it("keeps replies under their parent through every depth", () => {
    const tree = commentForest([{ id: "first", parent_id: null }, { id: "reply", parent_id: "first" }, { id: "nested", parent_id: "reply" }]);
    assert.deepEqual(tree.roots.map((row) => row.id), ["first"]);
    assert.deepEqual(tree.children.get("first")?.map((row) => row.id), ["reply"]);
    assert.deepEqual(tree.children.get("reply")?.map((row) => row.id), ["nested"]);
  });
  it("preserves other users' replies when a parent is deleted", () => {
    const tree = commentForest([{ id: "parent", parent_id: null, deleted_at: "2026-10-23" }, { id: "reply", parent_id: "parent", deleted_at: null }]);
    assert.equal(tree.children.get("parent")?.[0]?.id, "reply");
    assert.equal(tree.children.get("parent")?.[0]?.deleted_at, null);
  });
  it("does not hide a reply whose parent is unavailable", () => {
    assert.deepEqual(commentForest([{ id: "reply", parent_id: "hidden" }]).roots.map((row) => row.id), ["reply"]);
  });
});