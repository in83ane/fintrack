"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type SelectGroup = {
  label: string;
  options: SelectOption[];
};

export type SelectItem = SelectOption | SelectGroup;

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  items: SelectItem[];
  className?: string;
  placeholder?: string;
  dropdownAlign?: "left" | "right";
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  items,
  className,
  placeholder = "Select...",
  dropdownAlign = "left",
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // Flatten options to find the selected label
  const allOptions = useMemo(() => {
    const opts: SelectOption[] = [];
    items.forEach((item) => {
      if ("options" in item) {
        opts.push(...item.options);
      } else {
        opts.push(item);
      }
    });
    return opts;
  }, [items]);

  const selectedOption = allOptions.find((opt) => opt.value === value);

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-white",
          "bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors focus:outline-none focus:border-[#4EDEA3]/50",
          isOpen && "border-[#4EDEA3]/50 bg-white/10",
          disabled && "cursor-not-allowed opacity-50 hover:bg-white/5"
        )}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : <span className="text-gray-500">{placeholder}</span>}
        </span>
        <ChevronDown
          size={16}
          className={cn("text-gray-400 transition-transform duration-200 shrink-0", isOpen && "rotate-180")}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "absolute z-50 mt-1 min-w-full max-h-60 overflow-y-auto rounded-xl",
              "bg-[#1C1B1B] border border-white/10 shadow-xl custom-scrollbar",
              dropdownAlign === "right" ? "right-0" : "left-0"
            )}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.2) transparent",
            }}
          >
            <div className="p-1.5 flex flex-col gap-0.5">
              {items.map((item, index) => {
                if ("options" in item) {
                  // Render Group
                  return (
                    <div key={item.label + index} className="mb-1">
                      <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 select-none">
                        {item.label}
                      </div>
                      {item.options.map((opt) => (
                        <OptionItem
                          key={opt.value}
                          option={opt}
                          isSelected={value === opt.value}
                          onSelect={() => {
                            onChange(opt.value);
                            setIsOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  );
                } else {
                  // Render Single Option
                  return (
                    <OptionItem
                      key={item.value}
                      option={item}
                      isSelected={value === item.value}
                      onSelect={() => {
                        onChange(item.value);
                        setIsOpen(false);
                      }}
                    />
                  );
                }
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OptionItem({
  option,
  isSelected,
  onSelect,
}: {
  option: SelectOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={option.disabled}
      onClick={onSelect}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors text-left",
        option.disabled
          ? "opacity-50 cursor-not-allowed"
          : isSelected
          ? "bg-[#4EDEA3]/10 text-[#4EDEA3] font-bold"
          : "text-white hover:bg-white/10"
      )}
    >
      <span className="truncate">{option.label}</span>
      {isSelected && <Check size={14} className="shrink-0" />}
    </button>
  );
}
