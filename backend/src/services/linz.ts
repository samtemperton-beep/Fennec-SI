// Property details from the LINZ Data Service, for the Home Loan page.
//
// LINZ publishes addresses, boundaries and titles openly. Council valuations come
// from the District Valuation Roll, which is open (CC BY 4.0) only for councils
// that have agreed to release it; the full roll and all sale prices are
// government-only. So the rating valuation is shown where it's available, and
// otherwise the valuation reference lets people look it up on their council's site.
//
// Datasets (checked Nov 2026 via data.linz.govt.nz/services/api/v1.x/{layers,tables}/<id>/):
//   123113 NZ Addresses                              point, field "shape"
//   122657 NZ Property Boundaries                    multipolygon, field "geom"
//   114085 NZ Properties: National District Valuation Roll (open subset, table)
// Joined on unit_of_property_id. Layers are NZGD2000 (EPSG:4167), where WFS
// filters take latitude first.

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
  /** The council's rating valuation, when its roll is open data. */
  valuation: RatingValuation | null;
}

export interface RatingValuation {
  capital_value: number | null;
  land_value: number | null;
  improvements_value: number | null;
  /** The date the valuation applies from (councils revalue every three years). */
  valuation_date: string | null;
  bedrooms: number | null;
  floor_area_sqm: number | null;
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

async function wfs(key: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', ...params });
  const res = await fetch(`${WFS(key)}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { res, text: await res.text() };
}

async function getFeatures(key: string, params: Record<string, string>): Promise<any[]> {
  const { res, text } = await wfs(key, params);
  if (res.status === 401 || res.status === 403 || (!res.ok && /api.?key/i.test(text.slice(0, 300)))) {
    throw new Error(`LINZ refused the API key (status ${res.status}).`);
  }
  let body: any;
  try { body = JSON.parse(text); } catch {
    throw new Error(`LINZ returned an unexpected reply (status ${res.status}): ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  return Array.isArray(body?.features) ? body.features : [];
}

interface StreetParts { unit: string | null; number: number; suffix: string | null; road: string; rest: string[] }

/**
 * "2B Moorea Pl, Ponsonby" → number 2, suffix B, road "Moorea Place", rest ["ponsonby"].
 * Also "3/12 Smith St" and "Unit 3, 12 Smith St". LINZ may store "2B" either as
 * number 2 with suffix B or as unit B at number 2, so both are kept for matching.
 */
function parseAddress(address: string): StreetParts | null {
  let parts = address.split(',').map(p => p.trim()).filter(Boolean);
  let unit: string | null = null;
  const unitPart = parts[0]?.match(/^(?:unit|flat|apartment|apt)\.?\s+(\w+)$/i);
  if (unitPart) { unit = unitPart[1].toUpperCase(); parts = parts.slice(1); }
  const m = (parts[0] || '').replace(/^(?:unit|flat|apartment|apt)\.?\s+/i, '')
    .match(/^(?:([a-z0-9]+)\s*\/\s*)?(\d+)\s*([a-z])?\s+(.+)$/i);
  if (!m) return null;
  const words = m[4].split(/\s+/);
  const last = words[words.length - 1].toLowerCase().replace(/\.$/, '');
  if (ROAD_TYPES[last]) words[words.length - 1] = ROAD_TYPES[last];
  return {
    unit: unit ?? (m[1] ? m[1].toUpperCase() : null),
    number: Number(m[2]),
    suffix: m[3] ? m[3].toUpperCase() : null,
    road: words.join(' '),
    rest: parts.slice(1).map(p => p.toLowerCase()),
  };
}

/** [latitude, longitude] from a GeoJSON point, whichever order it came in (NZ latitudes are negative). */
function latLon(coords: any): [number, number] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [a, b] = coords.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a < 0 ? [a, b] : [b, a];
}

export async function lookupProperty(address: string, key: string): Promise<PropertyDetails> {
  const want = parseAddress(address);
  if (!want) throw new LinzError('Start the address with the street number, for example "12 Smith Street, Ponsonby".');
  const street = `${want.unit ? `${want.unit}/` : ''}${want.number}${want.suffix ?? ''} ${want.road}`;

  // 1. Every address at that number on that road (all units and suffixes), then
  //    pick the one matching the unit or letter and the suburb or town.
  const atNumber = (road: string) => getFeatures(key, {
    typeNames: 'layer-123113',
    count: '100',
    cql_filter: `full_road_name_ascii ILIKE '${road}' AND address_number = ${want.number}`,
  });
  // The exact road name first; then as the start of one ("Moorea" → "Moorea Place").
  let candidates = await atNumber(cql(want.road));
  if (!candidates.length) candidates = await atNumber(`${cql(want.road)}%`);
  if (!candidates.length) {
    const road = await getFeatures(key, { typeNames: 'layer-123113', count: '1', propertyName: 'full_road_name', cql_filter: `full_road_name_ascii ILIKE '${cql(want.road)}'` });
    throw new LinzError(road.length
      ? `LINZ has ${want.road}, but no number ${want.number} on it. Check the street number.`
      : `LINZ couldn't find a road called "${want.road}". Check the spelling, and write the road type in full if it's unusual.`);
  }
  const letter = want.unit ?? want.suffix;
  const placeScore = (p: any) => {
    const place = `${p.suburb_locality_ascii || ''} ${p.town_city_ascii || ''} ${p.territorial_authority_ascii || ''}`.toLowerCase();
    return want.rest.filter(r => place.includes(r)).length;
  };
  const score = (f: any) => {
    const p = f.properties || {};
    const unit = String(p.unit ?? '').toUpperCase();
    const suffix = String(p.address_number_suffix ?? '').toUpperCase();
    const unitScore = letter ? (unit === letter || suffix === letter ? 10 : 0) : (!unit && !suffix ? 5 : 0);
    return unitScore + placeScore(p);
  };
  const best = candidates.slice().sort((a, b) => score(b) - score(a))[0];
  const towns = new Set(candidates.map(c => `${c.properties?.suburb_locality_ascii}|${c.properties?.town_city_ascii}`));
  if (want.rest.length && placeScore(best.properties || {}) === 0 && towns.size > 1) {
    throw new LinzError(`More than one "${street}" in New Zealand, and none in ${want.rest.join(', ')}. Check the suburb and town in the address.`);
  }
  const a = best.properties || {};
  const point = latLon(best.geometry?.coordinates);

  // 2. The property at that point. The address point usually sits inside it; if
  //    not, take the property within about 25m.
  let prop: any = null;
  if (point) {
    const [lat, lon] = point;
    const fields = 'legal_description,title_no,area,valuation_reference,territorial_authority,unit_of_property_id';
    let found = await getFeatures(key, { typeNames: 'layer-122657', count: '1', propertyName: fields, cql_filter: `INTERSECTS(geom,POINT(${lat} ${lon}))` });
    if (!found.length) {
      const d = 0.00025;
      found = await getFeatures(key, { typeNames: 'layer-122657', count: '1', propertyName: fields, cql_filter: `BBOX(geom,${lat - d},${lon - d},${lat + d},${lon + d})` });
    }
    prop = found[0]?.properties ?? null;
  }

  // 3. The council valuation, if this council's roll is open. Never fails the lookup.
  let valuation: RatingValuation | null = null;
  if (prop?.unit_of_property_id) {
    try {
      const rows = await getFeatures(key, {
        typeNames: 'table-114085', count: '1',
        propertyName: 'capital_value,land_value,improvements_value,current_effective_valuation_date,no_of_bedrooms,building_total_floor_area',
        cql_filter: `unit_of_property_id = '${cql(String(prop.unit_of_property_id))}'`,
      });
      const v = rows[0]?.properties;
      const num = (x: any) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
      if (v && num(v.capital_value)) {
        valuation = {
          capital_value: num(v.capital_value),
          land_value: num(v.land_value),
          improvements_value: num(v.improvements_value),
          valuation_date: v.current_effective_valuation_date ? String(v.current_effective_valuation_date).slice(0, 10) : null,
          bedrooms: num(v.no_of_bedrooms),
          floor_area_sqm: num(v.building_total_floor_area),
        };
      }
    } catch (e: any) {
      console.error('[linz] valuation lookup failed:', e?.message ?? e);
    }
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
    valuation,
  };
}

/**
 * Which councils' valuation rolls are open data, for the health check. LINZ
 * doesn't publish the list, so this counts the open roll by council code.
 */
export async function valuationRollCoverage(key: string): Promise<{ code: number; name: string; properties: number }[]> {
  const codes = Array.from({ length: 90 }, (_, i) => i + 1);
  const counts: { code: number; properties: number }[] = [];
  // A few at a time, to be polite to LINZ.
  for (let i = 0; i < codes.length; i += 10) {
    await Promise.all(codes.slice(i, i + 10).map(async code => {
      const { text } = await wfs(key, { typeNames: 'table-114085', resultType: 'hits', cql_filter: `district_ta_code = ${code}` });
      // GeoServer answers a hits request as XML (numberMatched="N") or JSON ("numberMatched": N).
      const n = Number(text.match(/numberMatched"?\s*[=:]\s*"?(\d+)/)?.[1] ?? 0);
      if (n > 0) counts.push({ code, properties: n });
    }));
  }
  // Names from the boundaries layer, whose council id matches the roll's code.
  return Promise.all(counts.sort((a, b) => b.properties - a.properties).map(async c => {
    const ids = [String(c.code), String(c.code).padStart(3, '0')].map(id => `territorial_authority_id = '${id}'`).join(' OR ');
    const f = await getFeatures(key, { typeNames: 'layer-122657', count: '1', propertyName: 'territorial_authority', cql_filter: ids }).catch(() => []);
    return { ...c, name: f[0]?.properties?.territorial_authority || `Council ${c.code}` };
  }));
}
