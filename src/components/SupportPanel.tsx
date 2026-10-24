"use client";
import React, { useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Modal } from "./Modal";
import { useApp } from "@/src/context/AppContext";

export function SupportPanel({isOpen,onClose}:{isOpen:boolean;onClose:()=>void}) {
  const {language} = useApp();
  const [query,setQuery] = useState('');
  const th = language === 'th';
  const topics = [
    {title: th ? 'เพิ่มสินทรัพย์และเลือกโบรกเกอร์' : 'Add investments and choose a broker', detail: th ? 'เลือกพอร์ตจากแถบด้านบน แล้วไปที่ Portfolio เพื่อเพิ่มสินทรัพย์ เงินสดของแต่ละโบรกเกอร์แสดงแยกกัน' : 'Choose an account in the top bar, then open Portfolio to add an investment. Each broker’s cash balance is shown separately.', href:'/portfolio'},
    {title: th ? 'นำเข้าไฟล์ Excel' : 'Import an Excel file', detail: th ? 'เปิดเมนู Add บน Dashboard เลือก Import Excel ดาวน์โหลดไฟล์ตัวอย่างและตรวจสอบรายการก่อนยืนยัน' : 'Open Add on Dashboard and choose Import Excel. Download the template and review the rows before confirming.', href:'/dashboard'},
    {title: th ? 'ตรวจสอบอัตราแลกเปลี่ยน' : 'Check the exchange rate', detail: th ? 'แถบด้านบนแสดงเรท USD/THB พร้อมเวลาอัปเดต ราคาเก่าหรือเรทที่ระบุเองจะมีป้ายกำกับ' : 'The top bar shows the USD/THB rate and update time. Stale and manually entered rates are labelled.', href:'/settings'},
    {title: th ? 'ตรวจสอบรายการเงินสด' : 'Review cash activity', detail: th ? 'ใช้ Ledger เพื่อค้นหารายการและกรองตามช่วงเวลา บัญชี และประเภทรายการ' : 'Use Ledger to search transactions and filter by period, account and activity type.', href:'/ledger'},
    {title: th ? 'จัดสรรเงินเข้า Bucket' : 'Allocate money to buckets', detail: th ? 'ตั้งเป้าหมายและสัดส่วนเงินใน Bucket ตรวจสอบยอดก่อนยืนยันการจัดสรร' : 'Set goals and allocation percentages in Bucket. Review the amounts before confirming a distribution.', href:'/budget'},
  ];
  const matches = topics.filter(topic => (topic.title + topic.detail).toLowerCase().includes(query.toLowerCase()));
  return <Modal isOpen={isOpen} onClose={onClose} title={th ? 'ศูนย์ช่วยเหลือ' : 'Help & Support'}>
    <label className="flex items-center gap-3 rounded-xl border border-border p-3"><Search size={18}/><input className="min-w-0 w-full bg-transparent text-sm outline-none" value={query} onChange={e=>setQuery(e.target.value)} placeholder={th ? 'ค้นหาความช่วยเหลือ' : 'Search help'} aria-label={th ? 'ค้นหาความช่วยเหลือ' : 'Search help'} /></label>
    <div className="mt-5 divide-y divide-border">{matches.map(topic=><details key={topic.href} className="py-4"><summary className="font-semibold text-sm">{topic.title}</summary><p className="mt-3 text-sm text-muted leading-6">{topic.detail}</p><Link className="mt-3 inline-flex items-center gap-2 text-sm text-primary" href={topic.href} onClick={onClose}>{th ? 'เปิดหน้านี้' : 'Open workspace'}<ArrowUpRight size={16}/></Link></details>)}</div>
    {matches.length===0 && <p className="py-6 text-muted">{th ? 'ไม่พบหัวข้อนี้ ลองใช้คำค้นอื่น' : 'No matching topics. Try another search.'}</p>}
    <p className="mt-5 border-t border-border pt-4 text-xs text-muted">{th ? 'คู่มือในแอป · ยังไม่มีช่องทางติดต่อที่ตั้งค่าไว้' : 'In-app help · A contact channel has not been configured.'}</p>
  </Modal>;
}
