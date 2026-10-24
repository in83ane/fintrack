"use client";
import {CircleAlert} from "lucide-react";
export default function Error({reset}:{error:Error&{digest?:string};reset:()=>void}){return <section className="mx-auto max-w-xl px-6 py-16"><CircleAlert size={28} className="text-warning"/><h1 className="mt-5 text-2xl font-semibold">This workspace could not load</h1><p className="mt-3 text-sm text-muted">Try loading the page again. Your saved records have not been changed.</p><button className="ft-button ft-primary mt-6" onClick={reset}>Try Again</button></section>;}
