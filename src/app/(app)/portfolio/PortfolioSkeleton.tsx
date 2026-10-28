"use client";
import PortfolioView from "./PortfolioView";
// The real page owns every static node. Only its data slots switch to Sk.
export default function PortfolioSkeleton() { return <PortfolioView loading/>; }
