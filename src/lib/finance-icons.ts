// Stable identifiers for new records; legacy values are resolved at render time.
// Keeping this conversion out of the database preserves existing bucket history.
const legacyIcons: Record<string, string> = {
  "\u{1F4B0}": "wallet", "\u{1F3E6}": "bank", "\u{1F6E1}": "shield",
  "\u{1F4CA}": "chart", "\u{1F680}": "rocket", "\u{1F3AF}": "target",
  "\u{1F48E}": "gem", "\u{1F3E0}": "home", "\u{1F393}": "education",
  "\u2708": "travel", "\u{1F3E5}": "health", "\u{1F381}": "gift",
  "\u{1F6D2}": "shopping", "\u{1F6CD}": "shopping", "\u{1F354}": "food",
  "\u{1F697}": "transport", "\u{1F4A1}": "utilities", "\u{1F3AC}": "entertainment",
  "\u{1F4DA}": "education", "\u2615": "coffee", "\u{1F4BB}": "laptop",
  "\u{1F4C8}": "investment", "\u{1FA99}": "coins", "\u{1F4B3}": "card",
  "\u{1F4B5}": "income", "\u{1F4B8}": "expense", "\u{1F504}": "transfer",
  "\u{1F3F7}": "tag", "\u26A1": "lightning",
};

export function resolveFinanceIcon(value?: string | null): string {
  const key = (value || "wallet").replace(/[\uFE0E\uFE0F]/g, "");
  return legacyIcons[key] || key;
}

export const BUCKET_ICON_OPTIONS = [
  { name: "wallet", label: "กระเป๋าเงิน / Wallet" },
  { name: "bank", label: "ธนาคาร / Bank" },
  { name: "shield", label: "เงินสำรอง / Reserve" },
  { name: "chart", label: "การลงทุน / Investment" },
  { name: "rocket", label: "การเติบโต / Growth" },
  { name: "target", label: "เป้าหมาย / Goal" },
  { name: "gem", label: "สินทรัพย์ / Asset" },
  { name: "home", label: "บ้าน / Home" },
  { name: "education", label: "การศึกษา / Education" },
  { name: "travel", label: "ท่องเที่ยว / Travel" },
  { name: "health", label: "สุขภาพ / Health" },
  { name: "gift", label: "ของขวัญ / Gift" },
  { name: "shopping", label: "ซื้อของ / Shopping" },
] as const;
