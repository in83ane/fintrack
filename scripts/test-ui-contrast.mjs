import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/styles/tokens.css',import.meta.url),'utf8');
const dark=css.match(/:root \{([\s\S]*?)\n\}/)[1];
const light=css.match(/html\.light-mode \{([\s\S]*?)\n\}/)[1];
const parse=value=>{const m=value.match(/oklch\(([^ ]+) ([^ ]+) ([^)]+)\)/);return [parseFloat(m[1])/(m[1].includes('%')?100:1),Number(m[2]),Number(m[3])];};
const token=(block,name)=>parse(block.match(new RegExp(name+': ([^;]+);'))[1]);
function lum([L,C,H]){const a=C*Math.cos(H*Math.PI/180),b=C*Math.sin(H*Math.PI/180);const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;const rgb=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(v=>Math.min(1,Math.max(0,v)));return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
for(const [theme,block] of [['dark',dark],['light',light]]){
 for(const ink of ['--ft-ink','--ft-secondary','--ft-muted','--ft-gain','--ft-loss'])for(const surface of ['--ft-bg','--ft-panel','--ft-raised','--ft-overlay'])assert.ok(ratio(token(block,ink),token(block,surface))>=4.5,`${theme} ${ink} on ${surface}`);
 for(const brand of [token(dark,'--brand'),[.7,.11,195],[.72,.12,165]]){const accent=theme==='light'?[.43,brand[1],brand[2]]:brand;const on=theme==='light'?[.99,.005,255]:[.15,.015,brand[2]];assert.ok(ratio(accent,on)>=4.5,`${theme} filled brand text`);assert.ok(ratio(accent,token(block,'--ft-panel'))>=4.5,`${theme} brand text`);}
}
console.log('PASS source-token contrast: primary text, secondary/muted, gain/loss on four surfaces; default indigo and both token-only alternatives. Rendered and composited states still require browser audit.');
