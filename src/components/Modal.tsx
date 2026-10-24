"use client";
import React, {useEffect,useId,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
interface ModalProps {isOpen:boolean;onClose:()=>void;title:string;assetName?:string;assetSymbol?:string;children:React.ReactNode;contentClassName?:string;footer?:React.ReactNode;initialFocusRef?:React.RefObject<HTMLElement|null>;}
export function Modal({isOpen,onClose,title,assetName,assetSymbol,children,contentClassName='p-5',footer,initialFocusRef}:ModalProps) {
  const ref=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLElement|null>(null);
  const titleId=useId();
  const [present,setPresent]=useState(false);
  useEffect(()=>{if(isOpen)setPresent(true);},[isOpen]);
  useEffect(()=>{
    if(!present)return;
    const dialog=ref.current;
    if(!dialog)return;
    if(isOpen){
      if(!dialog.open){trigger.current=document.activeElement as HTMLElement;dialog.showModal();}
      const focus=initialFocusRef?.current || dialog.querySelector<HTMLElement>('[autofocus]');
      focus?.focus({preventScroll:true});
      return;
    }
    const timer=setTimeout(()=>{dialog.close();setPresent(false);if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});},matchMedia('(prefers-reduced-motion: reduce)').matches?0:200);
    return()=>clearTimeout(timer);
  },[present,isOpen,initialFocusRef]);
  useEffect(()=>{
    if(!present)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous;};
  },[present]);
  if(!present || typeof document==='undefined')return null;
  return createPortal(<dialog ref={ref} aria-labelledby={titleId} data-closing={!isOpen} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} className="ft-dialog">
    <div className="ft-dialog-shell">
      <div className="ft-sheet-handle" aria-hidden="true"/>
      <header className="ft-dialog-header"><div><h2 id={titleId} className="text-xl font-semibold">{assetName || title}</h2>{assetSymbol && <p className="text-sm text-muted">{assetSymbol}</p>}</div><button className="ft-icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></header>
      <div className={`ft-dialog-body ${contentClassName}`}>{children}</div>
      {footer && <footer className="ft-dialog-footer">{footer}</footer>}
    </div>
  </dialog>,document.body);
}
