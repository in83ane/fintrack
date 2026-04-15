"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Shield,
  Zap,
  Globe,
  BarChart3,
  PieChart,
  TrendingUp,
  ChevronRight
} from "lucide-react";
import Link from "next/link";
import { useApp } from "@/src/context/AppContext";

export default function LandingPageClient({ initialIsLogged }: { initialIsLogged: boolean }) {
  const { t, language, setLanguage } = useApp();
  const isLogged = initialIsLogged;

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const tiers = [
    {
      name: t("starter") || "Starter",
      price: "0",
      description: t("starter_desc") || "Perfect for individuals just starting their investment journey.",
      features: [
        t("feature_starter_1") || "Up to 5 Portfolio Assets",
        t("feature_starter_2") || "Basic Performance Tracking",
        t("feature_starter_3") || "Daily Market Updates",
        t("feature_starter_4") || "Community Support",
        t("feature_starter_5") || "Standard Security"
      ],
      cta: isLogged ? (t("go_to_dashboard") || "Go to Dashboard") : (t("start_for_free") || "Start for Free"),
      ctaLink: isLogged ? "/dashboard" : "/login?mode=register",
      highlight: false
    },
    {
      name: t("pro") || "Pro",
      price: "29",
      description: t("pro_desc") || "Advanced tools for serious investors looking for an edge.",
      features: [
        t("feature_pro_1") || "Unlimited Portfolio Assets",
        t("feature_pro_2") || "Real-time Analytics",
        t("feature_pro_3") || "AI-Powered Insights",
        t("feature_pro_4") || "Priority Support",
        t("feature_pro_5") || "Advanced Risk Analysis",
        t("feature_pro_6") || "Custom Export Formats"
      ],
      cta: isLogged ? (t("go_to_dashboard") || "Go to Dashboard") : (t("get_started_now") || "Get Started"),
      ctaLink: isLogged ? "/dashboard" : "/login?mode=register",
      highlight: true
    },
    {
      name: t("enterprise") || "Enterprise",
      price: "99",
      description: t("enterprise_desc") || "Custom solutions for institutional-grade portfolio management.",
      features: [
        t("feature_ent_1") || "Multi-User Collaboration",
        t("feature_ent_2") || "Dedicated Account Manager",
        t("feature_ent_3") || "Custom API Access",
        t("feature_ent_4") || "White-label Reports",
        t("feature_ent_5") || "SLA Guarantee",
        t("feature_ent_6") || "Advanced Compliance Tools"
      ],
      cta: isLogged ? (t("go_to_dashboard") || "Go to Dashboard") : (t("contact_sales") || "Contact Sales"),
      ctaLink: isLogged ? "/dashboard" : "/login?mode=register",
      highlight: false
    }
  ];

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-white selection:bg-[#4EDEA3] selection:text-[#0E0E0E] scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0E0E0E]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#4EDEA3] rounded-xl flex items-center justify-center">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"></path>
                <path d="M7 16l4-6 4 4 4-8"></path>
              </svg>
            </div>
            <span className="text-xl font-bold tracking-wide">FinTrack</span>
          </div>
          
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                onClick={(e) => scrollToSection(e, "features")}
                className="text-sm font-bold uppercase tracking-wide text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                {t("features_nav") || "Features"}
              </a>
              <a
                href="#pricing"
                onClick={(e) => scrollToSection(e, "pricing")}
                className="text-sm font-bold uppercase tracking-wide text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                {t("pricing_nav") || "Pricing"}
              </a>
            </div>
            
            <div className="flex items-center gap-3 border-r border-white/10 pr-4 mr-1">
                <button 
                  onClick={() => setLanguage('en')}
                  className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${language === 'en' ? 'text-[#4EDEA3]' : 'text-gray-500'}`}
                >
                  EN
                </button>
                <Globe size={12} className="text-gray-600" />
                <button 
                  onClick={() => setLanguage('th')}
                  className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${language === 'th' ? 'text-[#4EDEA3]' : 'text-gray-500'}`}
                >
                  TH
                </button>
            </div>

            {isLogged ? (
               <Link href="/dashboard" className="hidden sm:flex px-6 py-2.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-full text-sm font-bold uppercase tracking-wide hover:brightness-110 transition-all">
                {t("go_to_dashboard") || "Go to Dashboard"}
              </Link>
            ) : (
                <>
                <Link href="/login" className="hidden sm:block px-6 py-2.5 bg-white/5 border border-white/10 rounded-full text-sm font-bold uppercase tracking-wide hover:bg-white/10 transition-all">
                  {t("login_btn") || "Login"}
                </Link>
                <Link href="/login?mode=register" className="hidden md:block px-6 py-2.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-full text-sm font-bold uppercase tracking-wide hover:brightness-110 transition-all">
                  {t("get_started_btn") || "Get Started"}
                </Link>
                </>
            )}
            
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#4EDEA3]/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#ADC6FF]/10 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm font-bold uppercase tracking-wide text-[#4EDEA3] mb-8">
              {t("future_of_wealth") || "The Future of Wealth Management"}
            </span>
            <h1 className="text-5xl md:text-8xl font-bold tracking-tighter leading-[1.1] mb-8">
              {t("master_your") || "Master Your"} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4EDEA3] via-white to-[#ADC6FF]">
                {t("financial_destiny") || "Financial Destiny"}
              </span>
            </h1>
            <p className="max-w-2xl mx-auto text-gray-400 text-lg md:text-xl font-medium leading-relaxed mb-12">
              {t("hero_desc") || "Unified investment intelligence for the modern era. Track, analyze, and optimize your entire portfolio in one sophisticated interface."}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href={isLogged ? "/dashboard" : "/login?mode=register"} className="w-full sm:w-auto px-10 py-5 bg-[#4EDEA3] text-[#0E0E0E] rounded-2xl font-bold text-sm uppercase tracking-wide hover:brightness-110 transition-all flex items-center justify-center gap-2">
                 {isLogged ? (t("go_to_dashboard") || "Go to Dashboard") : (t("start_your_journey") || "Start Your Journey")} <ArrowRight size={16} />
              </Link>
              <a
                href="#pricing"
                onClick={(e) => scrollToSection(e, "pricing")}
                className="w-full sm:w-auto px-10 py-5 bg-white/5 border border-white/10 rounded-2xl font-bold text-sm uppercase tracking-wide hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {t("view_pricing") || "View Pricing"}
              </a>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-24 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E0E] via-transparent to-transparent z-10" />
            <div className="bg-[#1C1B1B] rounded-[2.5rem] border border-white/10 p-4 overflow-hidden aspect-video relative">
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FFB4AB]/20" />
                <div className="w-3 h-3 rounded-full bg-[#E9C349]/20" />
                <div className="w-3 h-3 rounded-full bg-[#4EDEA3]/20" />
              </div>
              <div className="w-full h-full bg-[#0E0E0E] rounded-2xl flex items-center justify-center">
                <BarChart3 size={64} className="text-white/10 animate-pulse" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{t("engineered_for_excellence") || "Engineered for Excellence"}</h2>
            <p className="text-gray-500 font-medium uppercase tracking-wide text-sm">{t("everything_you_need") || "Everything you need to dominate the markets"}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: TrendingUp, title: t("real_time_tracking") || "Real-time Tracking", desc: t("real_time_desc") || "Monitor your assets across all exchanges and wallets with zero latency." },
              { icon: Shield, title: t("institutional_security") || "Institutional Security", desc: t("security_desc") || "Military-grade encryption and multi-factor authentication for your peace of mind." },
              { icon: Zap, title: t("ai_insights_feature") || "AI Insights", desc: t("ai_desc") || "Leverage advanced machine learning to identify trends and optimize your strategy." },
              { icon: Globe, title: t("global_markets_feature") || "Global Markets", desc: t("global_desc") || "Access data from over 100+ global exchanges and 10,000+ financial instruments." },
              { icon: PieChart, title: t("asset_allocation_feature") || "Asset Allocation", desc: t("allocation_desc") || "Visualize your diversification and rebalance your portfolio with one click." },
              { icon: BarChart3, title: t("advanced_reporting") || "Advanced Reporting", desc: t("reporting_desc") || "Generate professional-grade tax and performance reports in seconds." }
            ].map((feature, i) => (
              <div key={i} className="group p-8 bg-[#1C1B1B] rounded-[2rem] border border-white/5 hover:border-[#4EDEA3]/30 transition-all">
                <div className="w-12 h-12 bg-[#4EDEA3]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="text-[#4EDEA3]" size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-[#131313]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{t("choose_your_tier") || "Choose Your Tier"}</h2>
            <p className="text-gray-500 font-medium uppercase tracking-wide text-sm">{t("transparent_pricing") || "Transparent pricing for every stage of growth"}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {tiers.map((tier, i) => (
              <div 
                key={i} 
                className={`relative p-10 rounded-[2.5rem] border ${
                  tier.highlight 
                    ? "bg-[#1C1B1B] border-[#4EDEA3]"
                    : "bg-[#0E0E0E] border-white/5"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#4EDEA3] text-[#0E0E0E] rounded-full text-sm font-bold uppercase tracking-wide">
                    {t("most_popular") || "Most Popular"}
                  </div>
                )}
                
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tighter">${tier.price}</span>
                    <span className="text-gray-500 text-sm font-bold uppercase tracking-wide">{t("per_month") || "/month"}</span>
                  </div>
                  <p className="mt-4 text-gray-500 text-sm leading-relaxed">{tier.description}</p>
                </div>

                <div className="space-y-4 mb-10">
                  {tier.features.map((feature, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#4EDEA3]/10 flex items-center justify-center">
                        <Check size={12} className="text-[#4EDEA3]" />
                      </div>
                      <span className="text-sm text-gray-400">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link 
                  href={tier.ctaLink}
                  className={`w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${
                    tier.highlight 
                      ? "bg-[#4EDEA3] text-[#0E0E0E] hover:brightness-110" 
                      : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
                  }`}
                >
                  {tier.cta} <ChevronRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-gradient-to-br from-[#1C1B1B] to-[#0E0E0E] rounded-[3rem] p-12 md:p-20 border border-white/5 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#4EDEA3]/5 blur-[80px] rounded-full" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#ADC6FF]/5 blur-[80px] rounded-full" />
            
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8 relative z-10">
              {t("ready_to_redefine") || "Ready to redefine your"} <br />
              <span className="text-[#4EDEA3]">{t("financial_future") || "financial future?"}</span>
            </h2>
            <p className="text-gray-400 text-lg mb-12 max-w-xl mx-auto relative z-10">
              {t("join_thousands") || "Join thousands of elite investors who trust FinTrack for their portfolio management."}
            </p>
            <Link href={isLogged ? "/dashboard" : "/login?mode=register"} className="inline-flex px-12 py-6 bg-[#4EDEA3] text-[#0E0E0E] rounded-2xl font-bold text-sm uppercase tracking-wide hover:brightness-110 transition-all relative z-10">
              {isLogged ? (t("go_to_dashboard") || "Go to Dashboard") : (t("get_started_now") || "Get Started Now")}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-[#4EDEA3] rounded-xl flex items-center justify-center">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18"></path>
                    <path d="M7 16l4-6 4 4 4-8"></path>
                  </svg>
                </div>
                <span className="text-xl font-bold tracking-wide">FinTrack</span>
              </div>
              <p className="text-gray-500 max-w-xs text-sm leading-relaxed">
                {t("footer_tagline") || "The ultimate portfolio management platform for the modern investor. Precision, security, and intelligence in one unified dashboard."}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wide text-white mb-6">{t("product") || "Product"}</h4>
              <ul className="space-y-4 text-sm text-gray-500">
                <li><a href="#features" onClick={(e) => scrollToSection(e, "features")} className="hover:text-[#4EDEA3] transition-colors cursor-pointer">{t("features_nav") || "Features"}</a></li>
                <li><a href="#pricing" onClick={(e) => scrollToSection(e, "pricing")} className="hover:text-[#4EDEA3] transition-colors cursor-pointer">{t("pricing_nav") || "Pricing"}</a></li>
                <li><a href="#" className="hover:text-[#4EDEA3] transition-colors">{t("security") || "Security"}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wide text-white mb-6">{t("company") || "Company"}</h4>
              <ul className="space-y-4 text-sm text-gray-500">
                <li><a href="#" className="hover:text-[#4EDEA3] transition-colors">{t("about") || "About"}</a></li>
                <li><a href="#" className="hover:text-[#4EDEA3] transition-colors">{t("blog") || "Blog"}</a></li>
                <li><a href="#" className="hover:text-[#4EDEA3] transition-colors">{t("careers") || "Careers"}</a></li>
                <li><a href="#" className="hover:text-[#4EDEA3] transition-colors">{t("contact") || "Contact"}</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-white/5">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-600">© 2024 FinTrack OS. {t("all_rights_reserved") || "All rights reserved."}</p>
            <div className="flex gap-8">
              <a href="/privacy-policy" className="text-sm font-bold uppercase tracking-wide text-gray-600 hover:text-white transition-colors">{t("privacy_policy_doc") || "Privacy Policy"}</a>
              <a href="/terms-of-service" className="text-sm font-bold uppercase tracking-wide text-gray-600 hover:text-white transition-colors">{t("terms_of_service_doc") || "Terms of Service"}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
