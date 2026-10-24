"use client";
import React from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {LayoutDashboard,Briefcase,ReceiptText,PiggyBank,CalendarDays} from "lucide-react";
import {motion} from "motion/react";
import {useApp} from "@/src/context/AppContext";
const items=[{path:'/dashboard',icon:LayoutDashboard,en:'Home',th:'ภาพรวม'},{path:'/portfolio',icon:Briefcase,en:'Portfolio',th:'พอร์ต'},{path:'/ledger',icon:ReceiptText,en:'Ledger',th:'รายการ'},{path:'/budget',icon:PiggyBank,en:'Bucket',th:'กระเป๋า'},{path:'/history',icon:CalendarDays,en:'History',th:'ประวัติ'}];
export function BottomNav(){const pathname=usePathname();const {language}=useApp();return <nav aria-label={language==='th'?'เมนูหลัก':'Primary navigation'} className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl bg-overlay p-1.5 shadow-xl lg:hidden" style={{paddingBottom:'calc(6px + env(safe-area-inset-bottom))'}}><div className="flex">{items.map(item=>{const active=pathname.startsWith(item.path);return <Link key={item.path} href={item.path} aria-current={active?'page':undefined} className="relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2">{active&&<motion.span layoutId="bottom-nav-pill" className="ft-nav-indicator" transition={{type:'spring',stiffness:400,damping:34}}/>}<item.icon size={19} className={active?'relative text-primary':'relative text-muted'}/><span className={`relative text-xs ${active?'font-semibold text-primary':'text-muted'}`}>{language==='th'?item.th:item.en}</span></Link>;})}</div></nav>;}
