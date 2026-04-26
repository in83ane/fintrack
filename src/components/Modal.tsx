"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  assetName?: string;
  assetSymbol?: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, assetName, assetSymbol, children }: ModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <React.Fragment>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal Container */}
          <div
            className="relative w-full sm:max-w-lg max-h-[90dvh] bg-[#1C1B1B] sm:border sm:border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Mobile Drag Handle Indicator */}
            <div className="shrink-0">
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-12 h-1.5 bg-white/20 rounded-full"></div>
              </div>
            </div>
            
            <div className="flex justify-between items-center px-8 py-4 sm:py-6 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-3">
                {assetName && (
                  <>
                    <h3 className="text-lg font-black text-white tracking-tight">{assetName}</h3>
                    {assetSymbol && <span className="text-sm font-medium text-gray-500">{assetSymbol}</span>}
                  </>
                )}
                {!assetName && <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
