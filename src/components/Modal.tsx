"use client";

import React from "react";
import { createPortal } from 'react-dom';
import { lockDocumentScroll } from "@/src/lib/scroll-lock";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  assetName?: string;
  assetSymbol?: string;
  children: React.ReactNode;
  contentClassName?: string;
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, assetName, assetSymbol, children, contentClassName = 'p-8', footer }: ModalProps) {
  const [mounted,setMounted]=React.useState(false);
  const dialog=React.useRef<HTMLDivElement>(null),close=React.useRef(onClose);
  const titleId=React.useId();
  close.current=onClose;
  React.useEffect(()=>setMounted(true),[]);
  React.useLayoutEffect(() => {
    if (isOpen) return lockDocumentScroll();
  }, [isOpen]);
  React.useLayoutEffect(()=>{
    if(!isOpen||!mounted)return;
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.focus({preventScroll:true});
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key!=='Tab')return;
      const nodes=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') || [])].filter(node=>node.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[isOpen,mounted]);

  if(!mounted)return null;
  return createPortal(
    <React.Fragment>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
          {/* Backdrop */}
          <div
            ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal Container */}
          <div
            className="relative w-full sm:max-w-lg max-h-[90dvh] bg-background sm:border sm:border-border rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Mobile Drag Handle Indicator */}
            <div className="shrink-0">
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-12 h-1.5 bg-white/20 rounded-full"></div>
              </div>
            </div>
            
            <div className="flex justify-between items-center px-8 py-4 sm:py-6 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                {assetName && (
                  <>
                    <h3 id={titleId} className="text-lg font-black text-white tracking-tight">{assetName}</h3>
                    {assetSymbol && <span className="text-sm font-medium text-gray-500">{assetSymbol}</span>}
                  </>
                )}
                {!assetName && <h3 id={titleId} className="text-xl font-black text-white tracking-tight">{title}</h3>}
              </div>
              <button
                aria-label="Close dialog" type="button"
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className={`${contentClassName} overflow-y-auto custom-scrollbar`}>
              {children}
            </div>
            {footer && <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">{footer}</div>}
          </div>
        </div>
      )}
    </React.Fragment>,document.body
  );
}
