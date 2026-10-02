/**
 * Indicative project scope estimator (Our Services wireframe). It gives a planning guide only —
 * the binding figure is always the engineer-reviewed quotation.
 */
export type Sector = 'industrial' | 'commercial' | 'residential';

export interface ScopeEstimate {
  tier: string;
  crew: string;
  cabling: string;
  sla: string;
  quoteSector: string;
}

export function estimateScope(sector: Sector, kva: number): ScopeEstimate {
  const heavy = kva >= 250;
  const medium = kva >= 100;
  const cable = kva >= 400 ? '240mm² 4-Core XLPE Armoured' : kva >= 250 ? '185mm² 4-Core XLPE Armoured' : kva >= 100 ? '95mm² 4-Core SWA' : kva >= 50 ? '35mm² 4-Core SWA' : '16mm² 4-Core SWA';
  if (sector === 'industrial') {
    return {
      tier: heavy ? 'Heavy Industrial HV Package' : medium ? 'Standard Heavy Industrial Package' : 'Light Industrial Package',
      crew: heavy ? '3 Engineers + 6 Field Techs' : medium ? '2 Engineers + 4 Field Techs' : '1 Engineer + 2 Field Techs',
      cabling: cable,
      sla: heavy ? '7–14 Business Days' : medium ? '3–5 Business Days' : '2–3 Business Days',
      quoteSector: 'INDUSTRIAL',
    };
  }
  if (sector === 'commercial') {
    return {
      tier: heavy ? 'Commercial Campus Package' : medium ? 'Commercial Building Package' : 'Commercial Fit-out Package',
      crew: heavy ? '2 Engineers + 4 Field Techs' : medium ? '1 Engineer + 3 Field Techs' : '1 Engineer + 2 Field Techs',
      cabling: cable,
      sla: heavy ? '5–10 Business Days' : medium ? '3–5 Business Days' : '1–3 Business Days',
      quoteSector: 'COMMERCIAL',
    };
  }
  return {
    tier: medium ? 'Estate / Multi-Dwelling Package' : 'Residential Installation Package',
    crew: medium ? '1 Engineer + 2 Electricians' : '1 Master Electrician + 1 Assistant',
    cabling: kva > 60 ? cable : '10mm² 3-Core SWA supply',
    sla: medium ? '3–5 Business Days' : '1–2 Business Days',
    quoteSector: 'COMMERCIAL',
  };
}
