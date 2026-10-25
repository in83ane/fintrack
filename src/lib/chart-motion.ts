/** Shared animation for Recharts, native SVG, progress bars and embeds. */
type Root = HTMLElement | SVGElement;
type State = { seen: boolean; visible: boolean; signature: string; animations: Animation[]; timer?: number; revision?: string; head?: SVGGElement; raf?: number; paths: Map<Element,string> };
const states=new WeakMap<Root,State>(), registered=new Set<Root>();
const selector='.chart-reveal, svg.recharts-surface, [data-chart], [data-chart-progress], .tradingview-widget-container';
let observer:IntersectionObserver|null=null, order=0, reset:number|undefined;
const paths=(root:Root)=>new Map([...root.querySelectorAll('path[d]')].filter(e=>!e.closest('defs,[data-chart-decoration]')).map(e=>[e,e.getAttribute('d')||'']));
function signature(root:Root){return [...(root.matches('[data-chart-progress]')?[root]:[]),...root.querySelectorAll('path,polyline,rect,circle[stroke-dasharray],[data-chart-bar],[data-chart-cell]')].filter(e=>!e.closest('defs,[data-chart-decoration],.recharts-tooltip-cursor,.recharts-active-dot')).map(e=>['d','points','x','y','width','height','stroke-dasharray','style'].map(a=>e.getAttribute(a)||'').join('|')).join(';')+(root.dataset.chartRevision||'');}
function head(root:Root,path:SVGPathElement,state:State,duration:number,delay:number){
  let length=0;try{length=path.getTotalLength();}catch{return;}if(!length||!path.parentElement)return;
  const ns='http://www.w3.org/2000/svg',group=document.createElementNS(ns,'g'),dot=document.createElementNS(ns,'circle'),value=document.createElementNS(ns,'text');
  group.dataset.chartDecoration='true';group.style.pointerEvents='none';dot.setAttribute('r','3');dot.setAttribute('fill',path.getAttribute('stroke')||'var(--color-primary)');dot.style.filter='drop-shadow(0 0 3px currentColor)';
  value.setAttribute('font-size','10');value.setAttribute('fill','var(--color-foreground)');value.setAttribute('x','-7');value.setAttribute('y','-8');value.setAttribute('text-anchor','end');group.append(dot,value);path.parentElement.append(group);state.head=group;
  const start=performance.now()+delay;
  const tick=(now:number)=>{const t=Math.max(0,Math.min(1,(now-start)/duration)),eased=1-Math.pow(1-t,3),point=path.getPointAtLength(length*eased);group.setAttribute('transform',`translate(${point.x} ${point.y})`);group.style.opacity=t>0?'1':'0';const end=Number(root.dataset.chartEndValue);if(root.dataset.chartEndValue&&Number.isFinite(end))value.textContent=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(end*eased);if(t<1&&root.isConnected)state.raf=requestAnimationFrame(tick);else dot.animate([{opacity:.6},{opacity:1},{opacity:.8}],{duration:700});};state.raf=requestAnimationFrame(tick);
}
export function playChart(root:Root,replay=false){
  const s=states.get(root);if(!s||!root.isConnected)return;
  s.animations.forEach(a=>a.cancel());s.animations=[];s.head?.remove();if(s.raf)cancelAnimationFrame(s.raf);if(s.timer)clearTimeout(s.timer);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,spark=root.getBoundingClientRect().height<=45,duration=reduced?150:replay?500:spark?700:1300,delay=reduced||replay?0:Math.min(order++,8)*80;
  clearTimeout(reset);reset=window.setTimeout(()=>{order=0;},100);root.dataset.chartAnimating='true';root.dataset.chartRevealed='true';root.dataset.chartRun=String(Number(root.dataset.chartRun||0)+1);
  const animate=(el:Element,frames:Keyframe[],options:KeyframeAnimationOptions={})=>{s.animations.push(el.animate(frames,{duration,delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards',...options}));};
  if(reduced)animate(root,[{opacity:.75},{opacity:1}],{easing:'linear'});
  else if(root.dataset.chart==='donut'||root.querySelector('.recharts-pie')){
    const startAngle=root.classList.contains('-rotate-90')?0:-Math.PI/2;
    const frames=Array.from({length:61},(_,frame)=>{const angle=frame/60*Math.PI*2;const points=['50% 50%',...Array.from({length:65},(_,i)=>{const a=startAngle+angle*i/64;return `${50+75*Math.cos(a)}% ${50+75*Math.sin(a)}%`;})];return {clipPath:`polygon(${points.join(',')})`,offset:frame/60};});
    animate(root,frames,{duration:replay?500:1100});
  }
  else{
    const rings=[...root.querySelectorAll('circle[stroke-dasharray],[data-chart-ring]')],bars=[...root.querySelectorAll('[data-chart-bar],.recharts-bar-rectangle,rect')].filter(e=>!e.closest('[data-chart-node],defs')&&!e.parentElement?.closest('.recharts-bar-rectangle')),cells=[...root.querySelectorAll('[data-chart-cell]')],nodes=[...root.querySelectorAll('[data-chart-node]')];
    let plots=[...root.querySelectorAll('[data-chart-plot],.recharts-area-area,.recharts-area-curve,.recharts-line-curve')];
    if(!plots.length&&!rings.length&&!nodes.length)plots=[...root.querySelectorAll('path,polyline')].filter(e=>!e.closest('defs,.recharts-bar-rectangle,.recharts-tooltip-cursor,[data-chart-decoration]'));
    if(root.matches('[data-chart-progress]'))bars.push(root);
    root.querySelectorAll('.recharts-cartesian-axis,.recharts-cartesian-grid').forEach(el=>animate(el,[{opacity:0},{opacity:1}],{duration:200,easing:'linear'}));
    rings.forEach((circle,i)=>animate(circle,[{strokeDasharray:`0 ${circle.getAttribute('pathLength')||1000}`},{strokeDasharray:circle.getAttribute('stroke-dasharray')||'100 100'}],{delay:delay+i*80,duration:replay?500:1100}));
    bars.forEach((bar,i)=>{const horizontal=bar.hasAttribute('data-chart-bar')||bar===root;(bar as Root).style.transformBox='fill-box';(bar as Root).style.transformOrigin=horizontal?'left center':'center bottom';const index=bar.matches('.recharts-bar-rectangle')?Array.from(bar.parentElement?.children||[]).indexOf(bar):i;animate(bar,[{transform:horizontal?'scaleX(0)':'scaleY(0)'},{transform:horizontal?'scaleX(1)':'scaleY(1)'}],{delay:delay+Math.min(300,index*25),duration:replay?350:600});});
    cells.forEach((cell,i)=>animate(cell,[{opacity:0,transform:'scale(.95)'},{opacity:1,transform:'scale(1)'}],{delay:delay+Number((cell as Root).dataset.chartColumn||i%7)*12,duration:replay?300:450}));
    nodes.forEach(node=>animate(node,[{opacity:0},{opacity:1}],{delay:delay+Number((node as Root).dataset.chartColumn||0)*180,duration:450}));
    const series=new Map<Element,number>();
    plots.forEach(plot=>{const group=plot.closest('.recharts-area,.recharts-line')||plot;if(!series.has(group))series.set(group,series.size);const index=series.get(group)!;const old=s.paths.get(plot),next=plot.getAttribute('d');if(replay&&old&&next&&old!==next&&old.replace(/[-\d.e+]+/g,'')===next.replace(/[-\d.e+]+/g,''))animate(plot,[{d:`path("${old}")`},{d:`path("${next}")`}],{duration:300,easing:'linear'});animate(plot,[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{delay:delay+(replay?0:bars.length?300:100)+(replay?0:Math.min(index,3)*120),duration:replay?400:spark?600:1200});});
    const line=plots.find(p=>p instanceof SVGPathElement&&p.getAttribute('fill')==='none') as SVGPathElement|undefined;if(line&&!spark&&!nodes.length)head(root,line,s,replay?400:1200,delay+100);
    if(!plots.length&&!bars.length&&!cells.length&&!rings.length&&!nodes.length)animate(root,[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}]);
  }
  const finishAt=Math.max(duration+delay,...s.animations.map(a=>Number(a.effect?.getComputedTiming().endTime)||0));
  s.seen=true;s.signature=signature(root);s.paths=paths(root);s.timer=window.setTimeout(()=>{delete root.dataset.chartAnimating;s.animations.forEach(a=>a.cancel());s.animations=[];const changed=signature(root)!==s.signature;if(changed&&s.visible)playChart(root,true);else{s.signature=signature(root);s.paths=paths(root);}},finishAt);
}
export function registerChart(root:Root){
  if(states.has(root))return;states.set(root,{seen:false,visible:false,signature:signature(root),animations:[],paths:paths(root)});registered.add(root);
  if(!observer&&'IntersectionObserver'in window)observer=new IntersectionObserver(entries=>{entries.sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left).forEach(entry=>{const root=entry.target as Root,s=states.get(root);if(!s)return;s.visible=entry.isIntersecting&&entry.intersectionRatio>=.35;if(s.visible&&!s.seen)playChart(root);});},{threshold:.35});
  if(observer)observer.observe(root);else playChart(root);
}
export function unregisterChart(root:Root){const s=states.get(root);s?.animations.forEach(a=>a.cancel());if(s?.timer)clearTimeout(s.timer);if(s?.raf)cancelAnimationFrame(s.raf);s?.head?.remove();observer?.unobserve(root);registered.delete(root);states.delete(root);}
export function reviseChart(root:Root,revision:string){const s=states.get(root);if(!s)return;if(s.revision===undefined){s.revision=revision;return;}if(s.revision!==revision){s.revision=revision;if(s.seen&&s.visible)playChart(root,true);else s.seen=false;}}
/** Currency labels can change without changing a normalized SVG path. */
export function replayVisibleCharts(){registered.forEach(root=>{const s=states.get(root)!;if(s.seen&&s.visible)playChart(root,true);else s.seen=false;});}
export function installChartMotion(){
  const scan=(parent:ParentNode)=>{[...(parent instanceof Element&&parent.matches(selector)?[parent]:[]),...parent.querySelectorAll(selector)].forEach(node=>{if(node.parentElement?.closest('.chart-reveal')||(node.matches('svg.recharts-surface')&&node.closest('[data-chart]')))return;registerChart(node as Root);});};scan(document);
  let timer:number|undefined;
  const mutations=new MutationObserver(records=>{if(records.every(r=>(r.target as Element).closest?.('[data-chart-decoration]')))return;records.forEach(r=>r.addedNodes.forEach(n=>{if(n instanceof Element&&!n.closest('[data-chart-decoration]'))scan(n);}));clearTimeout(timer);timer=window.setTimeout(()=>registered.forEach(root=>{if(!root.isConnected){unregisterChart(root);return;}const s=states.get(root)!;if(root.dataset.chartAnimating)return;const next=signature(root);if(next!==s.signature){if(s.seen&&s.visible)playChart(root,true);else{s.signature=next;s.seen=false;}}}),160);});
  mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['d','points','x','y','width','height','stroke-dasharray','data-chart-revision','style']});
  const query=window.matchMedia('(prefers-reduced-motion: reduce)'),changed=()=>registered.forEach(root=>{if(states.get(root)?.visible)playChart(root,true);});query.addEventListener('change',changed);
  return()=>{mutations.disconnect();clearTimeout(timer);query.removeEventListener('change',changed);[...registered].forEach(unregisterChart);observer?.disconnect();observer=null;};
}
