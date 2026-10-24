"use client";
import React, {useState} from "react";
import {Plus, Wallet, Briefcase, ArrowRightLeft} from "lucide-react";
import {usePathname, useRouter} from "next/navigation";
import {useApp} from "@/src/context/AppContext";
import {AddAssetModal} from "./AddAssetModal";
import {AddCashflowModal} from "./AddCashflowModal";

export function QuickAdd() {
  const {language}=useApp(); const pathname=usePathname(); const router=useRouter();
  const [assetOpen,setAssetOpen]=useState(false); const [cashOpen,setCashOpen]=useState(false);
  const details=React.useRef<HTMLDetailsElement>(null);
  const close=()=>{if(details.current)details.current.open=false;};
  React.useEffect(()=>{close();},[pathname]);
  React.useEffect(()=>{const outside=(e:PointerEvent)=>{if(!details.current?.contains(e.target as Node))close();}; const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[]);
  return <>
    <details ref={details} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 lg:bottom-6 lg:right-6">
      <summary className="ft-secondary flex h-12 w-12 items-center justify-center rounded-full list-none shadow-lg [&::-webkit-details-marker]:hidden" aria-label={language==='th'?'เพิ่มรายการด่วน':'Quick Add'}><Plus size={22}/></summary>
      <div className="ft-menu absolute bottom-16 right-0">
        <button onClick={()=>{close(); if(pathname==='/portfolio')window.dispatchEvent(new Event('fintrack:add-asset'));else setAssetOpen(true);}}><Briefcase size={18}/>{language==='th'?'เพิ่มสินทรัพย์':'Add Asset'}</button>
        <button onClick={()=>{close();setCashOpen(true);}}><Wallet size={18}/>{language==='th'?'บันทึกรายการเงินสด':'Cash Entry'}</button>
        <button onClick={()=>{close();router.push('/trade/plan');}}><ArrowRightLeft size={18}/>{language==='th'?'วางแผนซื้อขาย':'Plan Trade'}</button>
      </div>
    </details>
    <AddAssetModal isOpen={assetOpen} onClose={()=>setAssetOpen(false)}/><AddCashflowModal isOpen={cashOpen} onClose={()=>setCashOpen(false)}/>
  </>;
}
