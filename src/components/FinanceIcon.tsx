import {
  Wallet, Landmark, ShieldCheck, ChartNoAxesCombined, Rocket, Target, Gem,
  House, GraduationCap, Plane, HeartPulse, Gift, ShoppingBag, Utensils,
  Car, Lightbulb, Clapperboard, Coffee, Laptop, TrendingUp, Coins,
  CreditCard, Banknote, ArrowUpRight, ArrowRightLeft, Tag, Zap,
  ReceiptText, Info, Bell, Check, TriangleAlert, Star, X,
  type LucideIcon,
} from "lucide-react";
import { resolveFinanceIcon } from "@/src/lib/finance-icons";

const icons: Record<string, LucideIcon> = {
  wallet: Wallet, bank: Landmark, shield: ShieldCheck, chart: ChartNoAxesCombined,
  rocket: Rocket, target: Target, gem: Gem, home: House, education: GraduationCap,
  travel: Plane, health: HeartPulse, gift: Gift, shopping: ShoppingBag,
  food: Utensils, transport: Car, utilities: Lightbulb, entertainment: Clapperboard,
  coffee: Coffee, laptop: Laptop, investment: TrendingUp, coins: Coins,
  card: CreditCard, income: Banknote, expense: ArrowUpRight, transfer: ArrowRightLeft,
  tag: Tag, lightning: Zap, receipt: ReceiptText, info: Info, bell: Bell,
  check: Check, warning: TriangleAlert, star: Star, close: X,
};

/** Displays both semantic IDs and saved legacy bucket/category icons as SVG. */
export function FinanceIcon({ name, size = 18, className = "" }: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = icons[resolveFinanceIcon(name)] || Wallet;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.7} className={`inline-block shrink-0 align-middle ${className}`} />;
}
