// Physical video pixels, independent of computedStyle. A 64px marker outside
// the content crop aligns recorder PTS with the browser performance clock.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const out=path.resolve('output/navigation-round10');
const mode=process.env.QA_MODE||'dev';
const ffmpeg=process.env.FFMPEG_PATH||path.join(os.tmpdir(),'fintrack-video-qa/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const extract=async(crop,label)=>{
 const child=spawn(ffmpeg,['-hide_banner','-i',path.join(out,`video-${mode}.webm`),'-vf',`crop=${crop},signalstats,metadata=print:key=lavfi.signalstats.YAVG`,'-an','-f','null','-'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let log='';child.stderr.on('data',d=>log+=d);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0,log);
 writeFileSync(path.join(out,`video-${mode}-${label}.txt`),log);
 return [...log.matchAll(/frame:(\d+)\s+pts:\d+\s+pts_time:([\d.]+)[\s\S]*?lavfi.signalstats.YAVG=([\d.]+)/g)].map(m=>({frame:+m[1],pts:+m[2]*1000,y:+m[3]}));
};
const [marker,content]=await Promise.all([extract('32:32:0:0','marker'),extract('1186:926:254:74','luminance')]);
const pulses=marker.filter((f,i)=>f.y>200&&(!i||marker[i-1].y<=200));
assert.ok(pulses.length,'Recorded clock marker');
const data=JSON.parse(readFileSync(path.join(out,`video-${mode}.json`)));
const offset=pulses.at(-1).pts-data.mark;
const events=data.events.filter(e=>e.href?.startsWith('/'));
const results=events.map((event,i)=>{
 const start=event.t+offset-40,end=(events[i+1]?.t||data.frames.at(-1).t)+offset-20;
 const samples=content.filter(f=>f.pts>=start&&f.pts<end);
 const minimum=Math.min(...samples.map(s=>s.y));
 const low=samples.findIndex(s=>s.y===minimum);
 // Y is 8-bit limited-range luminance, not opacity. Small text/compression
 // changes are allowed (0.08/219 of the range); the fade itself is much larger.
 const violations=[];
 for(let j=1;j<samples.length;j++) {
  const delta=samples[j].y-samples[j-1].y;
  if(j<=low&&delta>.08)violations.push({kind:'rebound-on-exit',frame:samples[j].frame,delta});
  if(j>low&&delta<-.08)violations.push({kind:'second-dip-on-entry',frame:samples[j].frame,delta});
 }
 return {route:event.href,frames:samples.length,minimum,drop:samples[0].y-minimum,violations,samples};
});
writeFileSync(path.join(out,`video-${mode}-analysis.json`),JSON.stringify({crop:{x:254,y:74,width:1186,height:926},fps:25,offset,toleranceY:.08,results},null,2));
console.log(JSON.stringify(results.map(({samples,...r})=>r),null,2));
assert.equal(results.length,10);assert.ok(results.every(r=>r.drop>.3),'Every video cycle contains an observable fade');
assert.ok(results.every(r=>!r.violations.length),'Each video cycle falls once and rises once');
