export interface Broker {
  id: string
  name: string
  flag: string
  region: string
  url: string
  /** URL with {ticker} placeholder for direct stock page, if supported */
  tradeUrl?: string
  markets: ('US' | 'ASX' | 'NZX')[]
}

export const BROKERS: Broker[] = [
  // ── New Zealand ──
  { id: 'sharesies',  name: 'Sharesies',       flag: '🇳🇿', region: 'NZ', url: 'https://app.sharesies.nz/',                                              markets: ['NZX', 'ASX', 'US'] },
  { id: 'hatch',      name: 'Hatch',            flag: '🇳🇿', region: 'NZ', url: 'https://app.hatchinvest.nz/', tradeUrl: 'https://app.hatchinvest.nz/shares/{ticker}', markets: ['US'] },
  { id: 'investnow',  name: 'InvestNow',        flag: '🇳🇿', region: 'NZ', url: 'https://www.investnow.co.nz/',                                           markets: ['NZX', 'ASX'] },
  { id: 'asb',        name: 'ASB Securities',   flag: '🇳🇿', region: 'NZ', url: 'https://www.asb.co.nz/securities',                                       markets: ['NZX', 'ASX'] },
  { id: 'anz-nz',     name: 'ANZ Securities',   flag: '🇳🇿', region: 'NZ', url: 'https://www.anz.co.nz/personal/investments/share-trading/',              markets: ['NZX', 'ASX'] },
  { id: 'jarden',     name: 'Jarden Direct',    flag: '🇳🇿', region: 'NZ', url: 'https://www.jardendirect.co.nz/',                                        markets: ['NZX', 'ASX', 'US'] },
  // ── Australia ──
  { id: 'commsec',    name: 'CommSec',          flag: '🇦🇺', region: 'AU', url: 'https://www.commsec.com.au/',                                            markets: ['ASX', 'US'] },
  { id: 'selfwealth', name: 'SelfWealth',       flag: '🇦🇺', region: 'AU', url: 'https://www.selfwealth.com.au/',                                         markets: ['ASX', 'US'] },
  { id: 'superhero',  name: 'Superhero',        flag: '🇦🇺', region: 'AU', url: 'https://superhero.com.au/',                                              markets: ['ASX', 'US'] },
  { id: 'stake',      name: 'Stake',            flag: '🇦🇺', region: 'AU', url: 'https://hellostake.com/au/',                                             markets: ['ASX', 'US'] },
  { id: 'nabtrade',   name: 'nabtrade',         flag: '🇦🇺', region: 'AU', url: 'https://www.nabtrade.com.au/',                                           markets: ['ASX', 'US'] },
  // ── US / Global ──
  { id: 'robinhood',  name: 'Robinhood',        flag: '🇺🇸', region: 'US', url: 'https://robinhood.com/',        tradeUrl: 'https://robinhood.com/stocks/{ticker}',    markets: ['US'] },
  { id: 'webull',     name: 'Webull',           flag: '🇺🇸', region: 'US', url: 'https://www.webull.com/',       tradeUrl: 'https://www.webull.com/quote/{ticker}',     markets: ['US'] },
  { id: 'schwab',     name: 'Charles Schwab',   flag: '🇺🇸', region: 'US', url: 'https://www.schwab.com/',                                               markets: ['US'] },
  { id: 'fidelity',   name: 'Fidelity',         flag: '🇺🇸', region: 'US', url: 'https://www.fidelity.com/',                                             markets: ['US'] },
  { id: 'ibkr',       name: 'IBKR',             flag: '🌍',  region: 'Global', url: 'https://www.interactivebrokers.com/',                               markets: ['US', 'ASX', 'NZX'] },
  { id: 'etoro',      name: 'eToro',            flag: '🌍',  region: 'Global', url: 'https://www.etoro.com/',                                            markets: ['US', 'ASX'] },
]

export function getBrokerById(id: string): Broker | undefined {
  return BROKERS.find(b => b.id === id)
}

/** Returns the best URL to send a user for a given ticker on their broker. */
export function getBrokerTradeUrl(broker: Broker, ticker: string): string {
  if (broker.tradeUrl) return broker.tradeUrl.replace('{ticker}', ticker)
  return broker.url
}
