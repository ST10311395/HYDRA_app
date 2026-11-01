/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
/**
 * Public marketing content transcribed from the approved high-fidelity wireframes
 * (docs/wireframes/high-fidelity). Company names, figures, people and addresses shown in the
 * wireframes have not been verified as production client data, so every record is flagged
 * `is_demo` / `isDemoContent` and the app labels it as illustrative until the client confirms it.
 */
import type { PublicContentDto } from '@hydra/shared';

/**
 * Public company content (Part 3). Contact details are the verified ones from the PSG website and
 * portfolio; metrics, accreditations, certifications and testimonials are empty until the owner
 * supplies evidence for them. `emergencyLine` is kept for the API contract but is the normal business
 * line — the app makes no 24/7 or emergency-dispatch claim.
 */
export const PUBLIC_CONTENT: PublicContentDto = {
  company: {
    name: 'PSG Electrical & Cables',
    tagline: 'Innovation-driven electrical solutions',
    hotline: '082 603 9283',
    emergencyLine: '082 603 9283',
    whatsapp: '',
    email: 'keoran@psgelectrical.co.za',
    established: 0,
  },
  metrics: [],
  accreditations: [],
  certifications: [],
  testimonial: null,
  isDemoContent: false,
};

/**
 * Service catalogue aligned with the PSG website (Part 3). Slugs, categories, prices and image keys
 * are unchanged so existing jobs, quotes and AI policies keep resolving; only customer-facing wording
 * changed, and no turnaround or availability promises are made (slaText null).
 */
export const SERVICE_TYPES = [
  {
    slug: 'commercial-solar-micro-grids', name: 'Solar & Backup Power', category: 'SOLAR', basePrice: 18500, slaText: null,
    badge: 'Trite Solar', imageKey: 'service-solar',
    description: 'Solar panels, inverters and battery backup through our solar division, Trite Solar, integrated with your existing electrical installation.',
    specs: [{ label: 'Scope', value: 'Panels, inverters & batteries' }, { label: 'Division', value: 'Trite Solar' }],
    features: ['Site assessment and system sizing', 'Inverter and battery backup installation', 'Integration with existing distribution boards', 'Testing and CoC where required'],
  },
  {
    slug: 'industrial-cabling-fibre', name: 'Electrical Installations', category: 'CABLING', basePrice: 6500, slaText: null,
    badge: null, imageKey: 'service-cabling',
    description: 'Residential installations, commercial fit-outs and industrial electrical work, including cable management systems and infrastructure.',
    specs: [{ label: 'Sectors', value: 'Residential, commercial & industrial' }, { label: 'Includes', value: 'Cable management & containment' }],
    features: ['On-site assessment and clear quotation', 'New installations and fit-outs', 'Industrial installations and upgrades', 'Cable routing, trays and containment', 'Testing and CoC where required'],
  },
  {
    slug: 'hv-substations-distribution', name: 'Distribution Boards', category: 'SUBSTATIONS', basePrice: 45000, slaText: null,
    badge: null, imageKey: 'service-substation',
    description: 'New distribution board installations, upgrades and replacements, inspection and circuit organisation.',
    specs: [{ label: 'Work', value: 'Install, upgrade, replace' }, { label: 'Includes', value: 'Inspection & circuit labelling' }],
    features: ['New DB installations', 'Upgrades and replacements', 'Reconfiguration and circuit organisation', 'Inspection and labelling'],
  },
  {
    slug: 'emergency-repairs-diagnostics', name: 'Fault Finding', category: 'EMERGENCY', basePrice: 1450, slaText: null,
    badge: null, imageKey: 'service-emergency',
    description: 'Electrical fault diagnosis, testing and verification, with clear corrective recommendations and repairs.',
    specs: [{ label: 'Work', value: 'Diagnosis, testing & repair' }, { label: 'Outcome', value: 'Clear recommendations' }],
    features: ['Fault finding and system diagnostics', 'Testing and verification', 'Corrective recommendations', 'Fault repairs'],
  },
  {
    slug: 'coc-audits', name: 'Compliance (CoC) & Inspections', category: 'COMPLIANCE', basePrice: 1850, slaText: null,
    badge: null, imageKey: 'service-coc',
    description: 'Inspections and testing towards compliance with SANS 10142-1, with documentation and Certificates of Compliance where required, including work in hazardous areas.',
    specs: [{ label: 'Standard', value: 'SANS 10142-1' }, { label: 'Includes', value: 'Testing & documentation' }],
    features: ['SANS 10142-1 inspection and testing', 'Certificate of Compliance documentation', 'Hazardous-area inspections and compliance support', 'Remedial quotation where required'],
  },
  {
    slug: 'smart-energy-automation', name: 'Maintenance & Repairs', category: 'AUTOMATION', basePrice: 9800, slaText: null,
    badge: null, imageKey: 'service-automation',
    description: 'Preventative and scheduled maintenance, fault repairs and upgrades, planned to minimise disruption in operational facilities.',
    specs: [{ label: 'Type', value: 'Preventative & scheduled' }, { label: 'Includes', value: 'Repairs & upgrades' }],
    features: ['Preventative and scheduled maintenance', 'Electrical infrastructure upgrades', 'Load management improvements', 'Work within live operational facilities'],
  },
] as const;

export const PORTFOLIO = [
  {
    title: 'Cape Steel Smelter Substation Overhaul', clientName: 'Cape Smelting Works Ltd.', location: 'Saldanha, Western Cape', category: 'INDUSTRIAL',
    serviceSlug: 'hv-substations-distribution', imageKey: 'project-smelter', completedDate: '2024-01-18', featured: false, specBadge: '132kV / 40MVA', accreditation: 'ISO 45001',
    description: 'Turnkey high-voltage substation upgrade including transformer retrofit, heavy-duty conduit routing, and protection relay replacement completed during a planned shutdown window.',
    highlights: ['132kV High Voltage Switchgear', '40MVA Step-Down Transformer', '14,000m Heavy Armored Cable', 'Protection relay modernisation'],
  },
  {
    title: 'Global Tech HQ Smart Campus Power', clientName: 'Global Tech Innovations HQ', location: 'Sandton, Johannesburg', category: 'COMMERCIAL',
    serviceSlug: 'smart-energy-automation', imageKey: 'project-campus', completedDate: '2023-11-20', featured: false, specBadge: '11kV Distribution', accreditation: 'LEED Gold',
    description: 'Integrated electrical architecture for a 12-story commercial tower featuring automated lighting, dual 11kV feeds and full generator backup.',
    highlights: ['11kV Indoor Ring Main Unit', 'DALI-2 Automated Lighting', '2x 1000kVA Diesel Generators', 'Tenant sub-metering'],
  },
  {
    title: 'Eco-Park 4.5MW Rooftop Solar Array', clientName: 'Eco-Park Logistics Hub', location: 'Centurion, Gauteng', category: 'SOLAR',
    serviceSlug: 'commercial-solar-micro-grids', imageKey: 'project-solar', completedDate: '2024-02-14', featured: false, specBadge: '4.5MW Peak / 8MWh Storage', accreditation: 'NERSA Registered',
    description: 'Massive commercial rooftop solar installation with high-efficiency tier-1 PV modules and utility-scale battery storage.',
    highlights: ['8,200 Tier-1 Bifacial PV', '24x 125kW Hybrid Inverters', '8MWh LiFePO4 BESS Storage', 'SCADA performance monitoring'],
  },
  {
    title: 'TeraData Center Fiber Infrastructure', clientName: 'TeraData Cloud Africa', location: 'Midrand, Gauteng', category: 'DATA_FIBRE',
    serviceSlug: 'industrial-cabling-fibre', imageKey: 'project-datacenter', completedDate: '2023-12-08', featured: false, specBadge: 'Tier IV Dual Path', accreditation: 'Tier IV Data Center',
    description: 'High-density fibre optic cable overhaul and cable ladder deployment for a mission-critical financial data hall.',
    highlights: ['100G MTP/MPO Backbone Fiber', 'Precision Overhead Cable Ladder', 'A+B Redundant Power Feeds', 'OTDR certified links'],
  },
  {
    title: 'Vaal River Commercial Logistics Park', clientName: 'Vaal River Properties', location: 'Sasolburg, Free State', category: 'COMMERCIAL',
    serviceSlug: 'hv-substations-distribution', imageKey: 'project-logistics', completedDate: '2023-08-22', featured: false, specBadge: '22kV Substation', accreditation: 'SANS 10142-1 Industrial',
    description: 'Complete electrical electrification of a 45-hectare commercial logistics facility with emergency backup and high-bay lighting.',
    highlights: ['22kV Transformer Enclosure', '2,500A Main Switchboard', 'High-Bay LED Warehouse Lighting', 'Emergency lighting system'],
  },
  {
    title: '11kV Heavy Industrial Switchgear Installation', clientName: 'Manufacturing Plant', location: 'Gauteng', category: 'INDUSTRIAL',
    serviceSlug: 'hv-substations-distribution', imageKey: 'project-switchgear', completedDate: '2024-05-10', featured: true, specBadge: '11kV Switchgear', accreditation: 'ISO 9001',
    description: 'Supply, installation and commissioning of 11kV switchgear line-ups and motor control centres for a manufacturing plant expansion.',
    highlights: ['11kV Vacuum Switchgear', 'Motor Control Centres', 'Cable ladder & containment', 'Protection testing'],
  },
  {
    title: 'Smart Commercial Lighting & Backup Power Grid', clientName: 'Corporate Park', location: 'Sandton', category: 'COMMERCIAL',
    serviceSlug: 'smart-energy-automation', imageKey: 'project-office', completedDate: '2024-04-02', featured: true, specBadge: 'Smart Lighting', accreditation: 'SANS 10142-1',
    description: 'Open-plan office lighting retrofit with smart controls and a load-shedding backup power grid.',
    highlights: ['Smart LED lighting controls', 'Hybrid inverter backup', 'Essential load separation', 'Energy dashboards'],
  },
] as const;

export const PARTNERS = [
  { name: 'Siemens Industrial SA', category: 'EQUIPMENT_OEM', year: 1847, logoKey: 'partner-siemens', description: 'Global pioneer in heavy industrial switchgear, motor control centers, and high-voltage substation automation systems.', tags: ['Medium Voltage Breakers', 'PLC Controllers', 'Smart Grid Meters'], certification: 'SABS ISO 9001 & IEC 61439', guarantee: '5-Year Manufacturer Warranty' },
  { name: 'SolarTech Renewables', category: 'SOLAR_STORAGE', year: 2010, logoKey: 'partner-solartech', description: 'High-efficiency monocrystalline PV modules, commercial battery storage, and hybrid solar inverter architecture.', tags: ['N-Type bifacial solar panels', 'Lithium HV Battery Banks', 'Grid-Tie Inverters'], certification: 'TÜV Rheinland & Tier-1 BloombergNEF', guarantee: '25-Year Linear Power Output' },
  { name: 'AfriVolt Infrastructure', category: 'CABLES_CONDUCTORS', year: 1988, logoKey: 'partner-afrivolt', description: 'South African manufacturer of heavy-duty armored copper/aluminum cabling, underground ducting, and busbar systems.', tags: ['XLPE Armored MV Cable', 'High-Temp Fiber Optics', 'Substation Busbars'], certification: 'SANS 1507 / SABS Approved', guarantee: '10-Year Installed Integrity' },
  { name: 'SABS Standard Bureau', category: 'COMPLIANCE_AUDITING', year: 1945, logoKey: 'partner-sabs', description: 'Official statutory body responsible for maintaining electrical safety, product certification, and technical standards.', tags: ['Certificate of Compliance Audits', 'ISO Safety Compliance', 'Equipment Testing'], certification: 'SANS 10142-1 Wiring Code', guarantee: 'Statutory National Guarantee' },
  { name: 'Schneider Electric SA', category: 'EQUIPMENT_OEM', year: 1836, logoKey: 'partner-schneider', description: 'Digital energy management, commercial distribution boards, and industrial circuit protection technologies.', tags: ['Air Circuit Breakers', 'Surge Arresters', 'EcoStruxure Power Monitoring'], certification: 'IEC 60947 & ISO 14001', guarantee: '3-Year Replacement Guarantee' },
  { name: 'Nexans Cabling Systems', category: 'CABLES_CONDUCTORS', year: 1897, logoKey: 'partner-nexans', description: 'Advanced optical fibers, underwater power interconnects, and heavy industrial mining cable harnesses.', tags: ['Single-Mode Fiber Optics', 'Mining Trailing Cables', 'Subsea Feeders'], certification: 'ISO 45001 & RoHS Compliant', guarantee: '15-Year System Guarantee' },
  { name: 'Electrical Contractors Assoc.', category: 'COMPLIANCE_AUDITING', year: 1950, logoKey: 'partner-eca', description: 'ECA(SA) represents registered electrical contractors, guaranteeing technical workmanship, safety standards, and training.', tags: ['Master Electrician Credentials', 'Workmanship Guarantee Scheme', 'Safety Training'], certification: 'Department of Labour Registered', guarantee: 'ECA Workmanship Guarantee' },
  { name: 'Transnet Freight Rail', category: 'ENTERPRISE_CLIENT', year: 1990, logoKey: 'partner-transnet', description: 'National freight transport operator utilizing PSG Electrical for railway traction sub-station maintenance and heavy feeder repair.', tags: ['Substation Overhauls', '3kv Overhead Feeder Repair', 'Transformer Servicing'], certification: 'High-Voltage Class-A Vendor', guarantee: 'Multi-Year Service SLA' },
] as const;

export const TEAM = [
  { name: 'David Ndlovu', title: 'Lead Electrical Engineer', category: 'ENGINEERING', rating: 4.9, registration: 'Pr.Eng 20110482', licence: 'Master Wireman #MW-8842', skills: ['Substation Infrastructure', 'MV Power Grids', 'Transformer Maintenance', 'Protection Relays'], years: 18, projects: 142, lead: '132kV Substation Modernization - Rustenburg', availability: 'AVAILABLE', photoKey: 'team-david' },
  { name: 'Sarah van der Merwe', title: 'Senior Electrical & Solar Technician', category: 'TECHNICIANS', rating: 5.0, registration: 'Pr.Tech 20169120', licence: 'Red Seal #RS-4409', skills: ['Commercial Solar PV', 'Battery Storage (BESS)', 'Microgrid Integration', 'Inverter Commissioning'], years: 12, projects: 98, lead: '2.5MW Commercial Solar & BESS - Midrand', availability: 'ON_SITE', photoKey: 'team-sarah' },
  { name: 'Johan Pretorius', title: 'Senior Electrical Project Manager', category: 'MANAGEMENT', rating: 4.8, registration: 'PMP-SA #77291', licence: 'Wireman Class A #WA-3102', skills: ['Turnkey Infrastructure', 'Commercial Retrofits', 'Budget Optimization', 'Contractor Coordination'], years: 14, projects: 115, lead: 'Data Center Power & Cabling Retrofit - Sandton', availability: 'AVAILABLE', photoKey: 'team-johan' },
  { name: 'Sibusiso Khumalo', title: 'Chief Compliance & Safety Officer', category: 'COMPLIANCE', rating: 4.9, registration: 'ECB Inspector #8812', licence: 'CoC Inspector Master Class', skills: ['Legal CoC Audits', 'Hazardous Location Inspections', 'Arc Flash Studies', 'SANS 10142-1 Audits'], years: 16, projects: 210, lead: 'Mining Complex Safety Audit & CoC Renewal - Secunda', availability: 'IN_DISPATCH', photoKey: 'team-sibusiso' },
  { name: 'Elena Rostova', title: 'Lead Cabling Infrastructure Specialist', category: 'ENGINEERING', rating: 4.9, registration: 'FOA Master #59102', licence: 'Wireman Red Seal #RS-8819', skills: ['High-Density Fiber Optics', 'Server Room Cabling', 'OTDR Cable Testing', 'Structured Cabling'], years: 10, projects: 87, lead: 'Bank Headquarters Fiber Backbone - Rosebank', availability: 'AVAILABLE', photoKey: 'team-elena' },
] as const;

/** No office addresses have been published by PSG yet (Part 3); add verified offices here. */
export const OFFICES: readonly { region: string; name: string; area: string; address: string; phone: string; email: string; manager: string | null; hours: string; lat: number; lng: number }[] = [];

/** Department desks: none published yet (Part 3). The contact screen uses the verified main numbers. */
export const DEPARTMENTS: readonly { name: string; email: string; phone: string; sla: string; icon: string }[] = [];

/** FAQs reworded for Part 3: no turnaround, dispatch or 24/7 promises and no unverified claims. */
export const FAQS = [
  { category: 'QUOTATION', q: 'How long does a quotation take?', a: 'We review each request and contact you to confirm the scope. Where needed we arrange an on-site assessment before issuing a clear quotation, so timing depends on the size of the job.' },
  { category: 'QUOTATION', q: 'Is a site assessment included?', a: 'Where the scope cannot be confirmed from photos or a description, we arrange an on-site assessment before the quotation is issued.' },
  { category: 'QUOTATION', q: 'Can I accept or decline a quote in the app?', a: 'Yes. Your quote shows labour, materials, VAT and validity. Accepting it lets us schedule the work; declining lets you request an alternative.' },
  { category: 'COMPLIANCE', q: 'Do you issue Certificates of Compliance?', a: 'Yes. Where required, installations are tested and a Certificate of Compliance (CoC) is issued in line with SANS 10142-1.' },
  { category: 'COMPLIANCE', q: 'What should I do if there is a fire, smoke or someone has been shocked?', a: 'Move to safety and contact your local emergency services first. PSG Electrical is not an emergency service. Once everyone is safe, report the fault in the app or call us during office hours.' },
  { category: 'CONTACT', q: 'When can I contact PSG?', a: 'Our published office hours are 07:00–18:00. You can send a request or report a fault in the app at any time, and we respond during office hours.' },
  { category: 'CONTACT', q: 'How do I request a CoC inspection?', a: 'Choose “Compliance (CoC)” when you request a service or a quote.' },
  { category: 'CONTACT', q: 'How do I request work for a large commercial or industrial site?', a: 'Use the quote form with as much detail as you can, or email keoran@psgelectrical.co.za.' },
  { category: 'GENERAL', q: 'Do I need an account to browse services?', a: 'No. Services and company information are available without signing in. An account is only needed to request and track jobs.' },
  { category: 'GENERAL', q: 'How do reward points work?', a: 'You earn 1 point for every R10 of a fully paid invoice. Redeem points for discounts on eligible future invoices from the Rewards tab.' },
] as const;

export const MATERIALS = [
  { sku: 'CBL-SWA-16-4C', name: 'SWA Cable 16mm² 4-Core', unit: 'm', unitCost: 185.5, stock: 420, reorder: 150, supplier: 'AfriVolt Infrastructure' },
  { sku: 'CBL-SWA-185-4C', name: 'XLPE Armoured Cable 185mm² 4-Core', unit: 'm', unitCost: 1240, stock: 60, reorder: 80, supplier: 'AfriVolt Infrastructure' },
  { sku: 'CBL-GP-2.5', name: 'GP Wire 2.5mm² (100m roll)', unit: 'roll', unitCost: 980, stock: 34, reorder: 10, supplier: 'AfriVolt Infrastructure' },
  { sku: 'BRK-MCB-20A', name: 'MCB Circuit Breaker 20A 1P', unit: 'each', unitCost: 89.9, stock: 210, reorder: 50, supplier: 'Schneider Electric SA' },
  { sku: 'BRK-ELU-63A', name: 'Earth Leakage Unit 63A 30mA', unit: 'each', unitCost: 645, stock: 18, reorder: 10, supplier: 'Schneider Electric SA' },
  { sku: 'DB-24W-SURF', name: 'Distribution Board 24-Way Surface', unit: 'each', unitCost: 1150, stock: 9, reorder: 6, supplier: 'Schneider Electric SA' },
  { sku: 'SPD-T2-40KA', name: 'Surge Arrester Type 2 40kA', unit: 'each', unitCost: 1480, stock: 4, reorder: 8, supplier: 'Schneider Electric SA' },
  { sku: 'PV-550W-BF', name: 'Bifacial PV Module 550W', unit: 'each', unitCost: 2890, stock: 96, reorder: 40, supplier: 'SolarTech Renewables' },
  { sku: 'INV-HYB-10K', name: 'Hybrid Inverter 10kW', unit: 'each', unitCost: 28500, stock: 5, reorder: 3, supplier: 'SolarTech Renewables' },
  { sku: 'BAT-LFP-5K', name: 'LiFePO4 Battery 5.12kWh', unit: 'each', unitCost: 21900, stock: 7, reorder: 4, supplier: 'SolarTech Renewables' },
  { sku: 'CND-PVC-25', name: 'PVC Conduit 25mm (4m)', unit: 'length', unitCost: 42, stock: 350, reorder: 100, supplier: 'AfriVolt Infrastructure' },
  { sku: 'ERD-1.5M', name: 'Copper Earth Rod 1.5m', unit: 'each', unitCost: 265, stock: 40, reorder: 15, supplier: 'AfriVolt Infrastructure' },
  { sku: 'LUG-CU-185', name: 'Copper Cable Lug 185mm²', unit: 'each', unitCost: 78, stock: 150, reorder: 60, supplier: 'Nexans Cabling Systems' },
  { sku: 'FBR-SM-12C', name: 'Single-Mode Fibre 12-Core', unit: 'm', unitCost: 32.5, stock: 1800, reorder: 500, supplier: 'Nexans Cabling Systems' },
  { sku: 'LED-HB-150W', name: 'LED High-Bay 150W', unit: 'each', unitCost: 1690, stock: 22, reorder: 12, supplier: 'Schneider Electric SA' },
  { sku: 'ISO-DC-1000V', name: 'DC Isolator 1000V 32A', unit: 'each', unitCost: 540, stock: 30, reorder: 10, supplier: 'SolarTech Renewables' },
] as const;
