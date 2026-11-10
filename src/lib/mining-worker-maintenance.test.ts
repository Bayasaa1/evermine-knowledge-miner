import { test } from "node:test";
import assert from "node:assert/strict";
import { maintenanceTurn, runMiningMaintenance, savePendingMiningMind } from "./mining-worker-maintenance.server";

test("maintenance scans one lightweight row and wraps its durable cursor", async () => {
  const calls: [string, unknown][]=[];
  const query: any = {};
  for(const method of ["select","eq","is","not","neq","contains","gt","order","limit"]) {
    query[method]=(...args:unknown[])=>{calls.push([method,args]);return query;};
  }
  query.maybeSingle=async()=>({data:null,error:null});
  const admin={from:(table:string)=>{calls.push(["from",table]);return query;}};
  const next=await runMiningMaintenance(admin,{phase:2,cursors:{"2":"last-video","3":"other-video"}});
  assert.deepEqual(calls.filter(c=>c[0]==="from"), [["from","mining_jobs"]]);
  assert.deepEqual(calls.find(c=>c[0]==="select")?.[1], ["id"]);
  assert.deepEqual(calls.find(c=>c[0]==="limit")?.[1], [1]);
  assert.deepEqual(calls.find(c=>c[0]==="gt")?.[1], ["id","last-video"]);
  assert.deepEqual(next, {phase:3,cursors:{"3":"other-video"}});
});

test("all five automatic maintenance phases rotate without bulk JSON reads",async()=>{
  const query:any={maybeSingle:async()=>({data:null,error:null})};
  for(const m of ["select","eq","is","not","neq","contains","gt","order","limit"])query[m]=()=>query;
  const admin={from:()=>query};
  let state={phase:0,cursors:{}};
  for(let i=0;i<5;i++) {
    state=await runMiningMaintenance(admin,state);
    assert.equal(state.phase, (i+1)%5);
  }
});

function pendingAdmin(rows: unknown[]) {
  const calls: [string, unknown[]][] = [];
  const query: any = { maybeSingle: async () => ({ data: rows.shift() ?? null, error: null }) };
  for (const method of ["select", "eq", "is", "in", "gt", "neq", "or", "order", "limit"]) {
    query[method] = (...args: unknown[]) => { calls.push([method, args]); return query; };
  }
  return { admin: { from: () => query }, calls };
}

test("an active playlist alternates saving and mining rather than waiting for idle", () => {
  assert.equal(maintenanceTurn({}, true), false);
  assert.equal(maintenanceTurn({ lastWork: "mining" }, true), true);
  assert.equal(maintenanceTurn({ lastWork: "maintenance" }, true), false);
  assert.equal(maintenanceTurn({ lastWork: "maintenance" }, false), true);
});

test("finished Minds save before partial Minds regardless of repair phase", async () => {
  const job = { id: "finished", status: "done", next_index: 2, chunks: [{}, {}] };
  const { admin, calls } = pendingAdmin([{ id: job.id, updated_at: "lease" }, job]);
  const finalized: unknown[] = [];
  const result = await savePendingMiningMind(admin, { lastWork: "mining", "0": "old-cursor" }, async (row, opts) => {
    finalized.push([row, opts]); return "vault-finished";
  });
  assert.equal(result.saved, 1);
  assert.deepEqual(finalized, [[job, { deferTopics: true }]]);
  assert.equal(calls.some(([method]) => method === "in"), false);
  assert.equal(calls.some(([method]) => method === "gt"), false);
  assert.deepEqual(calls.filter(([method]) => method === "select").map(([, args]) => args), [["id,updated_at"], ["*"]]);
});

test("partial Mind refresh uses saved progress without completing or claiming the job", async () => {
  const job = { id: "partial", status: "queued", next_index: 2, chunks: [{}, {}, {}, {}] };
  const { admin, calls } = pendingAdmin([null, { id: job.id, updated_at: "lease" }, job]);
  const finalized: unknown[] = [];
  const result = await savePendingMiningMind(admin, {}, async (row, opts) => {
    finalized.push([row, opts]); return "vault-partial";
  });
  assert.equal(result.saved, 1);
  assert.deepEqual(finalized, [[job, { deferTopics: true, partial: { done: 2, total: 4 } }]]);
  assert.deepEqual(result.cursors, { partialJob: "partial", partialIndex: "2" });
  assert.deepEqual(calls.find(([method]) => method === "in")?.[1], ["status", ["queued", "paused_quota", "error"]]);
});

test("partial saves exclude unchanged progress but allow the next checkpoint", async () => {
  const { admin, calls } = pendingAdmin([null, null]);
  let finalized = false;
  const result = await savePendingMiningMind(admin, { partialJob: "previous", partialIndex: "2" }, async () => {
    finalized = true; return null;
  });
  assert.equal(finalized, false);
  assert.equal(result.handled, false);
  assert.deepEqual(calls.find(([method]) => method === "or")?.[1], ["id.neq.previous,next_index.neq.2"]);
});

test("a concurrently changed candidate is not hydrated or finalized from stale data", async () => {
  const { admin, calls } = pendingAdmin([{ id: "changed", updated_at: "old-lease" }, null]);
  let finalized = false;
  const result = await savePendingMiningMind(admin, {}, async () => { finalized = true; return "unexpected"; });
  assert.equal(finalized, false);
  assert.equal(result.saved, 0);
  assert.deepEqual(calls.find(([, args]) => args[0] === "updated_at")?.[1], ["updated_at", "old-lease"]);
});