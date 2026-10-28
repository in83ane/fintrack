import {createRequire} from 'node:module';import os from 'node:os';import path from 'node:path';import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'))('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const out='output/login-round11',results=[],errors=[];
const sizes=[[1366,768],[1440,900],[1905,908],[1280,720],[1024,768],[768,900],[390,844],[1280,640],[768,640],[390,640],[1024,600]];
try {
const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
for(const [width,height] of sizes)for(const theme of ['dark','light'])for(const lang of ['th','en']){
 await p.setViewportSize({width,height});await p.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
 await p.locator('.ft-auth-language button').filter({hasText:lang.toUpperCase()}).click();await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(40);
 const r=await p.evaluate(()=>{
 const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right}};
 return{card:rect('.ft-auth-card'),intro:rect('.ft-auth-intro'),submit:rect('button[type=submit]'),email:rect('#email'),password:rect('#password'),header:rect('.ft-auth-header'),footer:rect('.ft-auth-footer'),height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,grid:getComputedStyle(document.querySelector('.ft-auth-layout')).gridTemplateColumns,brandCount:document.querySelectorAll('.ft-auth-name').length,features:getComputedStyle(document.querySelector('.ft-auth-features')).display,body:document.querySelector('.ft-auth').innerText,font:getComputedStyle(document.querySelector('.ft-auth')).fontFamily};
 });results.push({viewport:{width,height},theme,lang,...r});
 assert.ok(r.width<=width,'No horizontal overflow');assert.equal(r.brandCount,1);assert.ok(!/SECURE CONNECTION|Secure connection|welcomeBack|loginNow/.test(r.body));assert.equal(r.email.h,48);assert.equal(r.password.h,48);
 if(width>=1024){assert.ok(r.card.x>=r.intro.right+70,'Two columns with gap');assert.ok(Math.abs(r.card.y+r.card.h/2-r.intro.y-r.intro.h/2)<1,'Aligned column centers');}
 if(height>=640&&width>=1024)assert.ok(r.height<=height+1,`No scrolling ${width}x${height} ${lang}: ${r.height}`);
 if(height>=640)assert.ok(r.card.bottom<=height+1,`Whole card visible ${width}x${height} ${lang}`);
 if(width<768){assert.equal(r.features,'none');assert.ok(r.submit.bottom<=height*2,'Submit within one screen of scrolling');}
 if([1905,390,768].includes(width)&&height>640)await p.screenshot({path:`${out}/${width}-${height}-${theme}-${lang}.png`,fullPage:true});
}
await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.ft-auth-layout').evaluate(e=>getComputedStyle(e).animationName),'none');
await p.emulateMedia({reducedMotion:'no-preference'});assert.equal(await p.locator('.ft-auth-layout').evaluate(e=>getComputedStyle(e).animationDuration),'0.2s');
fs.writeFileSync(`${out}/layout-results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({cases:results.length,heights:results.filter(r=>r.theme==='dark').map(r=>({viewport:r.viewport,lang:r.lang,page:r.height,card:r.card,submit:r.submit.bottom})),errors},null,2));assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(`${out}/layout-results.json`,JSON.stringify({results,errors},null,2));await browser.close();}
