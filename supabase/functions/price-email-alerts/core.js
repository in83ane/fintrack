/** No network or database dependencies: shared by the Edge worker and unit tests. */
export function emailConfiguration(env) {
  const from = (env('RESEND_FROM') || 'FinTrack <onboarding@resend.dev>').trim();
  const testRecipient = (env('RESEND_TEST_RECIPIENT') || '').trim().toLowerCase();
  const testMode = /@resend\.dev\s*>?$/i.test(from);
  const configured = !!env('RESEND_API_KEY') && (!testMode || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient));
  return { from, testRecipient, testMode, configured };
}
export function recipientAllowed(user, config) {
  return !!user?.email_confirmed_at && !!user?.email && (!config.testMode || user.email.toLowerCase() === config.testRecipient);
}
export function targetQuote(alert, quote, thbPerUsd) {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return null;
  if (!['USD','THB'].includes(alert.currency) || !['USD','THB'].includes(quote.currency)) return null;
  const price = quote.currency === alert.currency ? quote.price
    : Number.isFinite(thbPerUsd) && thbPerUsd > 0 ? quote.price * (alert.currency === 'THB' ? thbPerUsd : 1/thbPerUsd) : NaN;
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, hit: alert.direction === 'above' ? price >= Number(alert.target_price) : price <= Number(alert.target_price) };
}
export function marketSymbol(symbol) {
  const upper = symbol.trim().toUpperCase();
  for (const base of ['BTC','ETH','SOL','DOGE','XRP','USDT','BNB','ADA','AVAX','LINK']) {
    if ([base,`${base}USD`,`${base}USDT`].includes(upper)) return `${base}-USD`;
  }
  return upper;
}
export function emailPayload(alert, email, from) {
  const th = alert.locale === 'th';
  const fmt = n => new Intl.NumberFormat(th ? 'th-TH' : 'en-US', { style:'currency',currency:alert.currency,maximumFractionDigits:4 }).format(Number(n));
  const time = new Intl.DateTimeFormat(th ? 'th-TH' : 'en-US', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'});
  return {
    from, to:[email],
    subject:`FinTrack · ${alert.symbol} ${th ? 'ถึงราคาแจ้งเตือน' : 'price target reached'}`,
    text:[
      `${alert.symbol}: ${fmt(alert.current_price)}`,
      `${th ? 'เงื่อนไข' : 'Target'}: ${alert.direction === 'above' ? '≥' : '≤'} ${fmt(alert.target_price)}`,
      `${th ? 'ตรวจพบเมื่อ' : 'Detected'}: ${time.format(new Date(alert.triggered_at))} (Asia/Bangkok)`,
      alert.quote_at ? `${th ? 'เวลาราคาตลาด' : 'Market quote time'}: ${time.format(new Date(alert.quote_at))} (Asia/Bangkok)` : '',
      alert.note || '',
      th ? 'ตรวจราคาประมาณทุก 1 นาที ราคาตลาดอาจล่าช้า แจ้งเตือนนี้ส่งครั้งเดียว' : 'Prices are checked about once a minute and may be delayed. This alert is sent once.',
      th ? 'จัดการหรือลบการแจ้งเตือนได้ที่กระดิ่ง → ตั้งแจ้งเตือนราคาหุ้น ใน FinTrack' : 'Manage or delete alerts in FinTrack: notification bell → Manage price alerts.',
    ].filter(Boolean).join('\n\n'),
  };
}
export function retryDecision(status, firstAttempt, now = Date.now()) {
  // Provider idempotency lasts 24h. Stop before expiry rather than risk duplicate delivery.
  if (now - Date.parse(firstAttempt) >= 23 * 3600_000) return {status:'failed',last_error:'delivery_unconfirmed'};
  if ([400,401,403,404,409,422].includes(status)) return {status:'failed',last_error:`email_http_${status}`};
  if (status === 429) return {status:'skipped',last_error:'provider_limit_reached'};
  return {status:'pending',last_error:status ? `email_http_${status}` : 'email_network_error',next_attempt_at:new Date(now+5*60_000).toISOString()};
}
export async function sendEmail(alert, payload, key, fetcher = fetch) {
  const response = await fetcher('https://api.resend.com/emails', {
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`fintrack-price/${alert.id}`},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) return { ok:false,status:response.status };
  const data = await response.json();
  if (typeof data.id !== 'string') throw Error('Invalid email acknowledgement');
  return {ok:true,id:data.id};
}
