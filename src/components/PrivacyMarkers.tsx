"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

// Mark legacy amount labels without changing values or formatters.
export function PrivacyMarkers() {
  const path=usePathname();
  useEffect(()=>{
    const root=document.getElementById('main-content'); if(!root)return;
    const mark=(scope:Element)=>{
      for(const el of [scope,...Array.from(scope.querySelectorAll('span,p,h1,h2,h3,h4,td,div,strong'))]){
        if(el.children.length || el.hasAttribute('data-private'))continue;
        if(/^\s*[+−-]?[\d,]+(?:\.\d+)?\s*$/.test(el.textContent||'') || /(?:[$฿€¥]|\b(?:USD|THB|JPY|EUR)\b).*\d|\d[\d,.]*\s*(?:USD|THB|JPY|EUR)|[+−-]\s*\d[\d,.]*%/.test(el.textContent||''))el.setAttribute('data-private','');
      }
    };mark(root);
    const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData'&&record.target.parentElement)mark(record.target.parentElement);for(const node of record.addedNodes)if(node instanceof Element)mark(node);}});
    observer.observe(root,{childList:true,subtree:true,characterData:true});return()=>observer.disconnect();
  },[path]);
  return null;
}
