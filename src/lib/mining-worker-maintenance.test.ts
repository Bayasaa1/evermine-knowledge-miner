import { test } from "node:test";
import assert from "node:assert/strict";
import { runMiningMaintenance } from "./mining-worker-maintenance.server";

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