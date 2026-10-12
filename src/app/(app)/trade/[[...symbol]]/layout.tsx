import { redirect } from 'next/navigation';

/** Retired signal screen: block direct access for every ticker, including /trade.
 * The sibling /trade/plan route remains available and is not wrapped here.
 */
export default function RetiredTradeLayout() {
  redirect('/terminal');
}
