// Property details from the LINZ Data Service, for the Home Loan page.
//
// LINZ only publishes open property data: addresses, boundaries, titles and land
// area. Sales and valuations (the District Valuation Roll) are restricted to
// government agencies, so Fennec doesn't show them; the valuation reference lets
// people look their CV up on their council's website.
//
// Datasets (checked Nov 2026 via data.linz.govt.nz/services/api/v1.x/layers/<id>/):
//   123113 NZ Addresses           point, field "shape"
//   122657 NZ Property Boundaries multipolygon, field "geom"
// Both are NZGD2000 (EPSG:4167), where WFS filters take latitude first.

const WFS = (key: string) => `https://data.linz.govt.nz/services;key=${encodeURIComponent(key)}/wfs`;
const TIMEOUT_MS = 12_000;

export interface PropertyDetails {
  full_address: string;
  suburb: string | null;
  town: string | null;
  territorial_authority: string | null;
  legal_description: string | null;
  title_no: string | null;
  area_sqm: number | null;
  valuation_reference: string | null;
}

/** An error worth showing the person as is (not found, not set up). */
export class LinzError extends Error {}

const ROAD_TYPES: Record<string, string> = {
  st: 'Street', rd: 'Road', ave: 'Avenue', av: 'Avenue', dr: 'Drive', pl: 'Place', cres: 'Crescent',
  cr: 'Crescent', tce: 'Terrace', ln: 'Lane', hwy: 'Highway', ct: 'Court', cl: 'Close', pde: 'Parade',
  gr: 'Grove', sq: 'Square', wy: 'Way', blvd: 'Boulevard', esp: 'Esplanade',
};

// CQL string literal: quotes doubled, and no wildcards from the person's text.
const cql = (s: string) => s.replace(/'/g, "''").replace(/[%_]/g, ' ').trim();

async function getFeatures(key: string, params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', ...params });
  const res = await fetch(`${WFS(key)}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || (!res.ok && /api.?key/i.test(text.slice(0, 300)))) {
    throw new Error(`LINZ refused the API key (status ${res.status}).`);
  }
  let body: any;
  try { body = JSON.parse(text); } catch {
    throw new Error(`LINZ returned an unexpected reply (status ${res.status}): ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  return Array.isArray(body?.features) ? body.features : [];
}

/** "12 Smith St, Ponsonby, Auckland" → street part "12 Smith Street" and the rest. */
function splitAddress(address: string) {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  const words = (parts[0] || '').split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase().replace(/\.$/, '');
  if (last && ROAD_TYPES[last]) words[words.length - 1] = ROAD_TYPES[last];
  return { street: words.join(' '), rest: parts.slice(1).map(p => p.toLowerCase()) };
}

/** [latitude, longitude] from a GeoJSON point, whichever order it came in (NZ latitudes are negative). */
function latLon(coords: any): [number, number] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [a, b] = coords.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a < 0 ? [a, b] : [b, a];
}

export async function lookupProperty(address: string, key: string): Promise<PropertyDetails> {
  const { street, rest } = splitAddress(address);
  if (!/\d/.test(street)) throw new LinzError('Add the street number to the address, for example "12 Smith Street, Ponsonby".');

  // 1. The address. Match the number and street, then prefer one whose suburb or town matches.
  const candidates = await getFeatures(key, {
    typeNames: 'layer-123113',
    count: '20',
    cql_filter: `full_address_ascii ILIKE '${cql(street)}%'`,
  });
  if (!candidates.length) throw new LinzError(`LINZ couldn't find "${street}". Check the spelling of the street, and include the street number.`);
  const score = (f: any) => {
    const p = f.properties || {};
    const place = `${p.suburb_locality_ascii || ''} ${p.town_city_ascii || ''} ${p.territorial_authority_ascii || ''}`.toLowerCase();
    return rest.filter(r => place.includes(r)).length;
  };
  const best = candidates.slice().sort((a, b) => score(b) - score(a))[0];
  if (rest.length && score(best) === 0 && candidates.length > 1) {
    throw new LinzError(`More than one "${street}" in New Zealand, and none in ${rest.join(', ')}. Check the suburb and town in the address.`);
  }
  const a = best.properties || {};
  const point = latLon(best.geometry?.coordinates);

  // 2. The property at that point. The address point usually sits inside it; if
  //    not, take the property within about 25m.
  let prop: any = null;
  if (point) {
    const [lat, lon] = point;
    const fields = 'legal_description,title_no,area,valuation_reference,territorial_authority';
    let found = await getFeatures(key, { typeNames: 'layer-122657', count: '1', propertyName: fields, cql_filter: `INTERSECTS(geom,POINT(${lat} ${lon}))` });
    if (!found.length) {
      const d = 0.00025;
      found = await getFeatures(key, { typeNames: 'layer-122657', count: '1', propertyName: fields, cql_filter: `BBOX(geom,${lat - d},${lon - d},${lat + d},${lon + d})` });
    }
    prop = found[0]?.properties ?? null;
  }

  const area = Number(prop?.area);
  return {
    full_address: a.full_address || street,
    suburb: a.suburb_locality || null,
    town: a.town_city || null,
    territorial_authority: prop?.territorial_authority || a.territorial_authority || null,
    legal_description: prop?.legal_description || null,
    title_no: prop?.title_no || null,
    area_sqm: Number.isFinite(area) && area > 0 ? Math.round(area) : null,
    valuation_reference: prop?.valuation_reference || null,
  };
}
