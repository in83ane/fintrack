import React from 'react';
import { createRoot } from 'react-dom/client';
import { PriceAlertManager } from '../src/components/PriceAlertManager';
import { PRICE_ALERT_EVENT } from '../src/lib/price-alerts';
const Context = React.createContext<any>(null);
export const useApp = () => React.useContext(Context);
function App() {
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [assets, setAssets] = React.useState([{ symbol: 'AAPL' }]);
  const th = new URLSearchParams(location.search).get('lang') === 'th';
  const value = { language: th ? 'th' : 'en', currency: new URLSearchParams(location.search).get('currency') || 'USD', exchangeRates: { USD: 1, THB: 34, JPY:150, EUR:.9 },
    assets, moneyBuckets: [], isDataLoaded: true, userProfile: { email: 'price-alert-qa@example.test' }, notifPreferences: { priceAlerts: true },
    formatMoney: (n: number) => `$${n}`, addToast: () => {}, addNotification: (title: string, message: string) => setNotifications(n => [...n, { title, message }]) };
  return <Context.Provider value={value}><main style={{ padding: 24 }}>
    <button onClick={() => window.dispatchEvent(new Event(PRICE_ALERT_EVENT))}>Manage price alerts</button>
    <button onClick={() => setAssets([])}>Switch to empty portfolio</button>
    <output data-testid="notifications">{notifications.map(n => <p key={n.title}>{n.title} {n.message}</p>)}</output>
    <PriceAlertManager/>
  </main></Context.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
