// Akahu → Fennec mapping. Everything that interprets Akahu's response lives here
// as pure functions so it can be tested against real response shapes without
// network or database access.

const AKAHU_BASE = 'https://api.akahu.io/v1';

export interface AkahuPortfolioEntry {
  fund_id?: string;
  name?: string;
  symbol?: string;
  shares?: number;
  value?: number;
  currency?: string;
  returns?: number;
}

export interface AkahuAccount {
  _id: string;
  name: string;
  type: string;
  status?: string;
  connection?: { _id?: string; name?: string; connection_type?: string };
  balance?: { current?: number; currency?: string };
  meta?: {
    portfolio?: AkahuPortfolioEntry[];
    breakdown?: { returns?: number; cost_basis?: number };
    profile?: { pir?: number };
  };
  refreshed?: { balance?: string; meta?: string };
}

export interface MappedHolding {
  ticker: string;
  name: string;
  shares: number;
  buyPrice: number;
  currentPrice: number;
  value: number;
  market: 'US' | 'NZX' | 'ASX';
  // True when the symbol is ambiguous (two instruments share it), so a market
  // price lookup by ticker could return the wrong instrument.
  priceLocked: boolean;
}

export interface MappedBrokerAccount {
  akahuAccountId: string;
  name: string;
  connection: string;
  currency: string;
  totalBalance: number;
  holdingsValue: number;
  cashBalance: number;
  costBasis: number | null;
  returns: number | null;
  // null when the provider didn't give enough data to cross-check.
  reconciled: boolean | null;
  refreshedAt: string | null;
}

export interface MappedKiwiSaver {
  akahuAccountId: string;
  provider: string;
  balance: number;
  returns: number | null;
  pir: number | null;
  refreshedAt: string | null;
}

export interface MappedPortfolio {
  holdings: MappedHolding[];
  brokerAccounts: MappedBrokerAccount[];
  kiwisaver: MappedKiwiSaver[];
  warnings: string[];
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ── Akahu API ────────────────────────────────────────────────────────────────
export async function fetchAkahuAccounts(appToken: string, userToken: string): Promise<AkahuAccount[]> {
  const res = await fetch(`${AKAHU_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${userToken}`, 'X-Akahu-Id': appToken },
  });
  const body: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new Error('Akahu rejected your tokens. Re-enter them in Settings → Akahu.');
  }
  if (!res.ok || !body.success) {
    throw new Error(`Akahu error: ${body.message ?? res.statusText}`);
  }
  return body.items as AkahuAccount[];
}

// ── Mapping ──────────────────────────────────────────────────────────────────
function marketFor(currency: string | undefined): MappedHolding['market'] {
  if (currency === 'NZD') return 'NZX';
  if (currency === 'AUD') return 'ASX';
  return 'US';
}

// Names that read like a pooled fund rather than a single company. Used only to
// pick between two entries Akahu reports for one position (see collapse below).
const FUND_LIKE_NAME = /\b(etf|fund|trust|index|portfolio)\b/i;

interface Entry {
  symbol: string;
  name: string;
  shares: number;
  value: number;
  returns: number | null;
  currency: string;
}

const sameFigures = (a: Entry, b: Entry) =>
  Math.abs(a.shares - b.shares) < 1e-6 &&
  Math.abs(a.value - b.value) < 0.005 &&
  Math.abs((a.returns ?? 0) - (b.returns ?? 0)) < 0.005;

// Hatch reports a position once per instrument that shares its ticker. For
// example SpaceX's "SPCX" and the SPAC & New Issue ETF's "SPCX" each appear
// with identical figures, which double-counts the position (the account total
// only reconciles when it is counted once). Identical entries collapse to one;
// entries with different figures are genuinely separate holdings under one
// ticker and are summed, since Fennec keys holdings by ticker.
function collapseBySymbol(entries: Entry[], warnings: string[]) {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.symbol.toUpperCase();
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const out: { entry: Entry; ambiguous: boolean }[] = [];
  for (const [symbol, group] of groups) {
    if (group.length === 1) {
      out.push({ entry: group[0], ambiguous: false });
      continue;
    }
    const names = group.map((g) => g.name).join(' / ');
    if (group.every((g) => sameFigures(g, group[0]))) {
      const preferred = group.find((g) => !FUND_LIKE_NAME.test(g.name)) ?? group[0];
      out.push({ entry: preferred, ambiguous: true });
      warnings.push(
        `${symbol} was reported twice with identical figures (${names}). Counted once as "${preferred.name}", and its price is locked to the broker's valuation because the ticker is ambiguous.`
      );
    } else {
      const merged: Entry = {
        ...group[0],
        shares: group.reduce((s, g) => s + g.shares, 0),
        value: group.reduce((s, g) => s + g.value, 0),
        returns: group.every((g) => g.returns !== null) ? group.reduce((s, g) => s + (g.returns ?? 0), 0) : null,
      };
      out.push({ entry: merged, ambiguous: true });
      warnings.push(
        `${symbol} is used by ${group.length} different holdings (${names}). They were combined into one position, and its price is locked to the broker's valuation.`
      );
    }
  }
  return out;
}

export interface ExistingHolding {
  id: number | string;
  ticker: string;
  source?: string | null;
}

export interface HoldingSyncPlan {
  added: string[];
  updated: string[];
  toDelete: ExistingHolding[];
  unmatched: string[];
  suspiciousEmpty: boolean;
}

// Decides what a sync does to the user's existing holdings, without writing.
//  - incoming: the holdings to write (may be a subset of allAkahu on a capped plan)
//  - allAkahu: every holding Akahu returned
// Only positions previously synced from Akahu can be treated as "sold"; manual
// and CSV-imported rows are only removed when removeUnmatched is set. A
// position missing from `incoming` purely because of a plan cap is not sold.
export function planHoldingSync(opts: {
  incoming: { ticker: string }[];
  allAkahu: { ticker: string }[];
  existing: ExistingHolding[];
  removeUnmatched: boolean;
}): HoldingSyncPlan {
  const up = (s: string) => String(s).toUpperCase();
  const incomingSet = new Set(opts.incoming.map((h) => up(h.ticker)));
  const allSet = new Set(opts.allAkahu.map((h) => up(h.ticker)));
  const existingSet = new Set(opts.existing.map((h) => up(h.ticker)));

  const sold = opts.existing.filter((h) => h.source === 'akahu' && !allSet.has(up(h.ticker)));
  const notFromAkahu = opts.existing.filter((h) => h.source !== 'akahu' && !incomingSet.has(up(h.ticker)));

  // An empty response while synced positions exist is more likely a provider
  // glitch than a sale of everything, so refuse to delete in that case.
  const suspiciousEmpty = opts.allAkahu.length === 0 && sold.length > 0;

  return {
    added: opts.incoming.filter((h) => !existingSet.has(up(h.ticker))).map((h) => up(h.ticker)),
    updated: opts.incoming.filter((h) => existingSet.has(up(h.ticker))).map((h) => up(h.ticker)),
    toDelete: suspiciousEmpty ? [] : [...sold, ...(opts.removeUnmatched ? notFromAkahu : [])],
    unmatched: notFromAkahu.map((h) => h.ticker),
    suspiciousEmpty,
  };
}

export function toFennecProvider(connectionName: string): string {
  const n = connectionName.toLowerCase();
  if (n.includes('milford')) return 'Milford';
  if (n.includes('fisher')) return 'Fisher Funds';
  if (n.includes('superlife')) return 'SuperLife';
  if (n.includes('simplicity')) return 'Simplicity';
  if (n.includes('booster')) return 'Booster';
  if (n.includes('generate')) return 'Generate';
  if (n.includes('kernel')) return 'Kernel';
  return connectionName;
}

export function mapAkahuAccounts(accounts: AkahuAccount[]): MappedPortfolio {
  const warnings: string[] = [];
  const holdings: MappedHolding[] = [];
  const brokerAccounts: MappedBrokerAccount[] = [];
  const kiwisaver: MappedKiwiSaver[] = [];

  const active = accounts.filter((a) => a.status !== 'INACTIVE');
  for (const a of accounts) {
    if (a.status === 'INACTIVE' && ['INVESTMENT', 'KIWISAVER'].includes(a.type)) {
      warnings.push(`${a.connection?.name ?? a.name} is disconnected in Akahu, so it wasn't synced. Reconnect it at my.akahu.nz.`);
    }
  }

  for (const acct of active.filter((a) => a.type === 'KIWISAVER')) {
    kiwisaver.push({
      akahuAccountId: acct._id,
      provider: toFennecProvider(acct.connection?.name ?? acct.name),
      balance: finite(acct.balance?.current) ? acct.balance!.current! : 0,
      returns: finite(acct.meta?.breakdown?.returns) ? acct.meta!.breakdown!.returns! : null,
      pir: finite(acct.meta?.profile?.pir) ? acct.meta!.profile!.pir! : null,
      refreshedAt: acct.refreshed?.balance ?? null,
    });
  }

  for (const acct of active.filter((a) => a.type === 'INVESTMENT' && Array.isArray(a.meta?.portfolio))) {
    const label = acct.connection?.name ?? acct.name;
    const currency = acct.balance?.currency ?? 'USD';

    const entries: Entry[] = [];
    for (const raw of acct.meta!.portfolio!) {
      const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim() : '';
      if (!symbol || !finite(raw.shares) || !finite(raw.value)) {
        warnings.push(`Skipped an entry from ${label} with missing symbol, shares or value${raw.name ? ` (${raw.name})` : ''}.`);
        continue;
      }
      entries.push({
        symbol,
        name: raw.name ?? symbol,
        shares: raw.shares,
        value: raw.value,
        returns: finite(raw.returns) ? raw.returns : null,
        currency: raw.currency ?? currency,
      });
    }

    const collapsed = collapseBySymbol(entries, warnings);
    let holdingsValue = 0;
    for (const { entry: e, ambiguous } of collapsed) {
      holdingsValue += e.value;
      const currentPrice = e.shares > 0 ? e.value / e.shares : 0;
      // Cost basis per share = (market value − total return) / shares. Without a
      // return figure we can't know cost, so fall back to current price (0% gain).
      const buyPrice =
        e.returns !== null && e.shares > 0 ? Math.max(0, (e.value - e.returns) / e.shares) : currentPrice;
      if (e.returns === null) warnings.push(`${e.symbol}: no return data from ${label}, so its gain/loss can't be calculated.`);

      holdings.push({
        ticker: e.symbol.toUpperCase(),
        name: e.name,
        shares: e.shares,
        buyPrice: round(buyPrice, 4),
        currentPrice: round(currentPrice, 4),
        value: round(e.value, 2),
        market: marketFor(e.currency),
        priceLocked: ambiguous,
      });
    }

    // Cash held at the same provider (Hatch exposes it as a separate WALLET account).
    const cash = active
      .filter((a) => a.type === 'WALLET' && a.connection?._id && a.connection._id === acct.connection?._id)
      .reduce((s, w) => s + (finite(w.balance?.current) ? w.balance!.current! : 0), 0);

    const costBasis = finite(acct.meta?.breakdown?.cost_basis) ? acct.meta!.breakdown!.cost_basis! : null;
    const returns = finite(acct.meta?.breakdown?.returns) ? acct.meta!.breakdown!.returns! : null;
    const totalBalance = finite(acct.balance?.current) ? acct.balance!.current! : holdingsValue;

    // Cross-check our (deduplicated) holdings against the provider's own totals.
    let reconciled: boolean | null = null;
    if (costBasis !== null && returns !== null) {
      reconciled = Math.abs(holdingsValue - (costBasis + returns)) <= 1;
    }
    if (reconciled === false) {
      warnings.push(
        `${label}: holdings total ${round(holdingsValue, 2)} doesn't match the provider's own total ${round((costBasis ?? 0) + (returns ?? 0), 2)}. Some positions may be missing or double-counted.`
      );
    }

    brokerAccounts.push({
      akahuAccountId: acct._id,
      name: acct.name,
      connection: label,
      currency,
      totalBalance: round(totalBalance, 2),
      holdingsValue: round(holdingsValue, 2),
      cashBalance: round(cash, 2),
      costBasis: costBasis === null ? null : round(costBasis, 2),
      returns: returns === null ? null : round(returns, 2),
      reconciled,
      refreshedAt: acct.refreshed?.balance ?? null,
    });
  }

  holdings.sort((a, b) => b.value - a.value);
  return { holdings, brokerAccounts, kiwisaver, warnings };
}
