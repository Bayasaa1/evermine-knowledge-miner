import { test, expect } from "bun:test";
import { repairTimingsLocal } from "./repair-timings";
import { stampToSeconds, secondsToStamp, type TranscriptLine } from "./subtitle-health";

// Preserve the original iterative interpolation, including generated anchors.
function reference(lines: TranscriptLine[]) {
  const anchors = lines.map(l => stampToSeconds(l.timestamp));
  if (anchors.every(a => a != null)) return lines;
  const weights = lines.map(l => Math.max(1, String(l.speech ?? "").trim().length));
  const guess = Math.max(30, Math.round(weights.reduce((a,b) => a+b,0)*0.08));
  const out = lines.map(l => ({...l}));
  for (let index=0; index<out.length; index++) {
    if (anchors[index]!=null) continue;
    let before=0, after=guess, endIndex=out.length;
    for (let i=index-1;i>=0;i--) { const a=anchors[i]; if(a!=null) {before=a;break;} }
    for (let i=index+1;i<out.length;i++) { const a=anchors[i]; if(a!=null) {after=a;endIndex=i;break;} }
    let startIndex=index;
    while(startIndex>0 && anchors[startIndex-1]==null) startIndex--;
    const ws=weights.slice(startIndex,endIndex);
    const total=ws.reduce((a,b)=>a+b,0)||1;
    const consumed=weights.slice(startIndex,index).reduce((a,b)=>a+b,0);
    const span=Math.max(after-before,ws.length*2);
    const start=before+span*consumed/total;
    const end=before+span*(consumed+(weights[index]??1))/total;
    anchors[index]=start;
    const line=out[index];
    if(line) line.timestamp=`${secondsToStamp(start)} - ${secondsToStamp(Math.max(end,start+1))}`;
  }
  return out;
}

test("timing optimization preserves every original interpolation and word", () => {
  for(let seed=0;seed<100;seed++) {
    const lines=Array.from({length:80},(_,i)=>({timestamp:(i*17+seed)%9===0?secondsToStamp(i*3):"",speech:"word ".repeat(1+(i+seed)%13)}));
    expect(repairTimingsLocal(lines)).toEqual(reference(lines));
    expect(lines.filter(l=>l.timestamp==="").length).toBeGreaterThan(0);
  }
});
test("long untimed transcript preserves all 30000 words without repeated gap scans", () => {
  const lines=Array.from({length:30000},(_,i)=>({timestamp:"",speech:`original ${i}`}));
  const repaired=repairTimingsLocal(lines);
  expect(repaired.length).toBe(30000);
  expect(repaired.map(l=>l.speech)).toEqual(lines.map(l=>l.speech));
  expect(repaired.every(l=>stampToSeconds(l.timestamp)!=null)).toBe(true);
  expect(repairTimingsLocal([])).toEqual([]);
  const timed=[{timestamp:"00:15",speech:"unchanged"}];
  expect(repairTimingsLocal(timed)).toBe(timed);
});