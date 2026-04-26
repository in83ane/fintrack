"use client";
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ResponsiveGridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useApp, DashboardWidget, WidgetType } from "@/src/context/AppContext";
import { WidgetContent, WIDGET_META } from "./WidgetRenderer";
import { Plus, X, GripVertical, LayoutGrid, Check } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";

const ALL_TYPES: WidgetType[] = ["watchlist","monthly_summary","allocation_pie","daily_journal","equity_curve","bucket_overview","pl_calendar_mini","top_movers"];

export default function DashboardGrid() {
  const { t, dashboardWidgets, setDashboardWidgets } = useApp();
  const [editing, setEditing] = useState(false);
  const [showLib, setShowLib] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const layouts = useMemo(() => ({
    lg: dashboardWidgets.map(w => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: w.minW || 1, minH: w.minH || 2 })),
    md: dashboardWidgets.map(w => ({ i: w.i, x: w.x % 3, y: w.y, w: Math.min(w.w, 3), h: w.h, minW: 1, minH: 2 })),
    sm: dashboardWidgets.map(w => ({ i: w.i, x: 0, y: w.y, w: 2, h: w.h, minW: 1, minH: 2 })),
    xs: dashboardWidgets.map(w => ({ i: w.i, x: 0, y: w.y, w: 1, h: w.h, minW: 1, minH: 2 })),
  }), [dashboardWidgets]);

  const onLayoutChange = useCallback((layout: Layout, _layouts: any) => {
    if (!editing) return;
    setDashboardWidgets(dashboardWidgets.map(w => {
      const l = layout.find(item => item.i === w.i);
      return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
    }));
  }, [editing, dashboardWidgets, setDashboardWidgets]);

  const addWidget = (type: WidgetType) => {
    const id = `w${Date.now()}`;
    const maxY = dashboardWidgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    setDashboardWidgets([...dashboardWidgets, { i: id, type, x: 0, y: maxY, w: type === "equity_curve" ? 2 : 1, h: 2, minW: 1, minH: 2 }]);
    setShowLib(false);
  };

  const removeWidget = (id: string) => {
    setDashboardWidgets(dashboardWidgets.filter(w => w.i !== id));
  };

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <LayoutGrid size={14} className="text-[#ADC6FF]" />
          {t("editDashboard")}
        </h2>
        <div className="flex gap-2">
          {editing && (
            <button onClick={() => setShowLib(true)} className="px-3 py-1.5 bg-[#ADC6FF]/10 text-[#ADC6FF] rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[#ADC6FF]/20 transition-all">
              <Plus size={12} /> {t("addWidget")}
            </button>
          )}
          <button onClick={() => setEditing(!editing)} className={cn("px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all", editing ? "bg-[#4EDEA3] text-[#00285d]" : "bg-white/5 text-gray-400 hover:text-white border border-white/10")}>
            {editing ? <><Check size={12} /> {t("doneDashboard")}</> : <><LayoutGrid size={12} /> {t("editDashboard")}</>}
          </button>
        </div>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 4, md: 3, sm: 2, xs: 1 }}
        rowHeight={120}
        width={containerWidth}
        margin={[16, 16] as readonly [number, number]}
        dragConfig={{ enabled: editing, handle: ".drag-handle" }}
        resizeConfig={{ enabled: editing, handles: ["se"] as const }}
        onLayoutChange={onLayoutChange}
      >
        {dashboardWidgets.map(widget => (
          <div key={widget.i} className={cn("bg-[#1C1B1B] rounded-2xl border shadow-lg overflow-hidden", editing ? "border-[#ADC6FF]/30 ring-1 ring-[#ADC6FF]/10" : "border-white/5")}>
            <div className="h-full p-4 flex flex-col">
              {editing && (
                <div className="flex justify-between items-center mb-1 -mt-1">
                  <div className="drag-handle cursor-grab active:cursor-grabbing p-1 text-gray-500 hover:text-white transition-colors">
                    <GripVertical size={12} />
                  </div>
                  <button onClick={() => removeWidget(widget.i)} className="p-1 text-gray-500 hover:text-[#FFB4AB] transition-colors">
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <WidgetContent type={widget.type} />
              </div>
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>

      {/* Widget Library Modal */}
      <AnimatePresence>
        {showLib && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLib(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-[#1C1B1B] rounded-3xl border border-white/10 p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-base font-bold text-white mb-4">{t("widgetLibrary")}</h3>
              <div className="grid grid-cols-2 gap-3">
                {ALL_TYPES.map(type => {
                  const meta = WIDGET_META[type];
                  const exists = dashboardWidgets.some(w => w.type === type);
                  return (
                    <button key={type} onClick={() => !exists && addWidget(type)} disabled={exists} className={cn("p-4 rounded-2xl border text-left transition-all flex items-center gap-3", exists ? "bg-white/5 border-white/5 opacity-40 cursor-not-allowed" : "bg-white/[0.02] border-white/10 hover:bg-[#ADC6FF]/5 hover:border-[#ADC6FF]/30")}>
                      <div className="w-8 h-8 rounded-xl bg-[#ADC6FF]/10 text-[#ADC6FF] flex items-center justify-center">{meta.icon}</div>
                      <span className="text-xs font-bold text-white">{t(meta.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setShowLib(false)} className="w-full mt-4 py-3 text-gray-500 text-xs font-bold hover:text-white transition-colors">{t("cancel")}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
