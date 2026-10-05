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

export const PUBLIC_CONTENT: PublicContentDto = {
  company: {
    name: 'PSG Electrical & Cables',
    tagline: '& Cables · South Africa',
    hotline: '+27 11 987 6500',
    emergencyLine: '+27 800 911 911',
    whatsapp: '+27 11 987 6500',
    email: 'jhb.dispatch@psgelectrical.co.za',
    established: 2008,
  },
  metrics: [
    { group: 'home', key: 'years', value: '15+', label: 'Years Experience', caption: 'Industrial & commercial power', accent: 'primary' },
    { group: 'home', key: 'solar', value: '500+', label: 'MW Solar Capacity', caption: 'Rooftop & ground-mount PV', accent: 'secondary' },
    { group: 'home', key: 'uptime', value: '99.9%', label: 'Uptime Guarantee', caption: 'Critical infrastructure SLAs', accent: 'primary' },
    { group: 'home', key: 'dispatch', value: '<60m', label: 'Dispatch Response', caption: 'High-priority fault callouts', accent: 'neutral' },
    { group: 'work', key: 'projects', value: '250+', label: 'Projects', caption: 'Completed Nationwide', accent: 'primary' },
    { group: 'work', key: 'solar', value: '18.5MW', label: 'Solar Installed', caption: 'Grid & Off-Grid Capacity', accent: 'secondary' },
    { group: 'why', key: 'years', value: '15+', label: 'Years Lead', caption: '', accent: 'primary' },
    { group: 'why', key: 'iso', value: '100%', label: 'SANS ISO', caption: '', accent: 'secondary' },
    { group: 'why', key: 'dispatch', value: '<60m', label: 'Dispatch', caption: '', accent: 'neutral' },
    { group: 'partners', key: 'oems', value: '45+', label: 'Global OEMs', caption: '', accent: 'primary' },
    { group: 'partners', key: 'sabs', value: '100%', label: 'SABS Approved', caption: '', accent: 'secondary' },
    { group: 'partners', key: 'warranty', value: '25 Yr', label: 'Solar Warranty', caption: '', accent: 'neutral' },
    { group: 'team', key: 'experience', value: '15+ Yrs', label: 'Avg Experience', caption: '', accent: 'primary' },
    { group: 'team', key: 'coc', value: '100%', label: 'CoC Compliance', caption: '', accent: 'neutral' },
    { group: 'team', key: 'incidents', value: 'Zero', label: 'Lost Time Incidents', caption: '', accent: 'secondary' },
    { group: 'contact', key: 'emergency', value: '< 15 Mins', label: 'Emergency', caption: '', accent: 'neutral' },
    { group: 'contact', key: 'commercial', value: '< 2 Hours', label: 'Commercial', caption: '', accent: 'primary' },
    { group: 'contact', key: 'audit', value: 'Same Day', label: 'Site Audit', caption: '', accent: 'secondary' },
  ],
  accreditations: [
    { code: 'ISO 9001', title: 'Quality System', caption: 'Certified quality assurance for high-voltage installations, switchgear assembly, fibre terminations and preventative maintenance.', accent: 'primary' },
    { code: 'ECB GRADE A', title: 'Contractor Board', caption: 'Registered electrical contractor.', accent: 'primary' },
    { code: 'PV GREENCARD', title: 'Solar Master', caption: 'Accredited solar PV installers.', accent: 'secondary' },
    { code: 'CIDB LEVEL 7', title: 'Infrastructure', caption: 'Construction Industry Development Board grading.', accent: 'primary' },
  ],
  certifications: [
    { title: 'ECSA Registered Engineers', caption: 'Pr.Eng & Pr.Tech — Engineering Council of South Africa certified professionals on every project.', accent: 'primary' },
    { title: 'SANS 10142 Compliance', caption: 'Wiring Code 100% — guaranteed valid Certificate of Compliance (CoC) issued for all installations.', accent: 'primary' },
    { title: 'Master Wireman Licensed', caption: 'Department of Labour — single & three-phase wireman licences held by all senior field inspectors.', accent: 'secondary' },
    { title: 'Tribe Solar Master Certified', caption: 'PV GreenCard Accredited — authorised installers for commercial solar PV and industrial battery storage.', accent: 'secondary' },
  ],
  testimonial: {
    quote:
      'PSG Electrical handled our entire 1.2MW solar transition and HV substation commissioning with zero downtime to production. Outstanding engineering rigor and compliance.',
    author: 'David Marais',
    role: 'Operations Director, Mining Supplies Co.',
    rating: 5,
  },
  isDemoContent: true,
};

export const SERVICE_TYPES = [
  {
    slug: 'commercial-solar-micro-grids', name: 'Commercial Solar & Micro-Grids', category: 'SOLAR', basePrice: 18500, slaText: 'SLA: 5–14 Business Days',
    badge: 'Tribe Solar Partner', imageKey: 'service-solar',
    description: 'Turnkey high-efficiency photovoltaic installations, grid-tied hybrid inverters, and utility-scale battery storage to eliminate load-shedding downtime.',
    specs: [{ label: 'Capacity', value: '20kW to 2.5MW' }, { label: 'Storage', value: 'LiFePO4 BESS' }, { label: 'Warranty', value: '25-Yr Panel Guarantee' }, { label: 'Payback', value: '2.5 – 4 Years ROI' }],
    features: ['Site yield & shading study', 'Hybrid inverter and BESS design', 'Generator sync & load-shedding automation', 'NRS 097 grid-tie compliance', 'Remote monitoring handover'],
  },
  {
    slug: 'industrial-cabling-fibre', name: 'Industrial Cabling & Fiber Optics', category: 'CABLING', basePrice: 6500, slaText: 'SLA: 2–7 Business Days',
    badge: 'High Density', imageKey: 'service-cabling',
    description: 'Heavy-duty power reticulation, armoured cable jointing, high-density fibre optic backbones, and structured data cabling.',
    specs: [{ label: 'Cable Type', value: 'XLPE / Armoured SWA' }, { label: 'Data Spec', value: 'Cat6A / Single-Mode' }, { label: 'Voltage', value: 'Low to 33kV High V' }, { label: 'Testing', value: 'OTDR & Insulation' }],
    features: ['Cable route survey', 'Trenching, ducting & cable ladder', 'MV joints and terminations', 'Fibre splicing and OTDR certification', 'As-built documentation'],
  },
  {
    slug: 'hv-substations-distribution', name: 'High-Voltage Substations & Distribution', category: 'SUBSTATIONS', basePrice: 45000, slaText: 'SLA: 10–21 Business Days',
    badge: 'Utility Grade', imageKey: 'service-substation',
    description: 'Design, supply, and energization of 11kV – 33kV substations, oil/dry transformers, ring main units and protection systems.',
    specs: [{ label: 'Rating', value: '11kV / 22kV / 33kV' }, { label: 'Transformer', value: '315kVA to 5MVA' }, { label: 'Switchgear', value: 'Vacuum / SF6 RMU' }, { label: 'Safety', value: 'Arc-Flash Protection' }],
    features: ['Protection coordination study', 'Transformer supply and installation', 'RMU and switchgear commissioning', 'Earthing & lightning protection', 'Utility energisation liaison'],
  },
  {
    slug: 'emergency-repairs-diagnostics', name: '24/7 Emergency Repairs & Diagnostics', category: 'EMERGENCY', basePrice: 1450, slaText: 'SLA: Immediate Dispatch (60m)',
    badge: '60-Min Emergency SLA', imageKey: 'service-emergency',
    description: 'Rapid-dispatch industrial electricians equipped with thermal imaging, insulation analysers and fault-location tooling.',
    specs: [{ label: 'Response', value: 'Under 60 Mins' }, { label: 'Coverage', value: 'Gauteng & Nationwide' }, { label: 'Diagnostics', value: 'FLIR Thermal / Megger' }, { label: 'Availability', value: '24/7/365 Standby' }],
    features: ['Fault finding and isolation', 'Thermal imaging inspection', 'Cable fault location', 'Generator and panel failure response', 'Make-safe and temporary supply'],
  },
  {
    slug: 'coc-audits', name: 'Certificate of Compliance (CoC) & Audits', category: 'COMPLIANCE', basePrice: 1850, slaText: 'SLA: 24–48 Hours',
    badge: 'Master Electrician', imageKey: 'service-coc',
    description: 'Official Department of Labour accredited 1-phase and 3-phase electrical inspection certificates for residential, commercial and industrial property.',
    specs: [{ label: 'Authority', value: 'Dept of Labour Accredited' }, { label: 'Phase', value: '1-Phase & 3-Phase Heavy' }, { label: 'Turnaround', value: '24 to 48 Hours' }, { label: 'Legality', value: 'Official Legal Certificate' }],
    features: ['SANS 10142-1 inspection', 'Earth leakage & insulation testing', 'Remedial quote where required', 'Digital CoC in the app', 'Property transfer ready'],
  },
  {
    slug: 'smart-energy-automation', name: 'Smart Energy & Industrial Automation', category: 'AUTOMATION', basePrice: 9800, slaText: 'SLA: 3–10 Business Days',
    badge: 'Save Up to 40%', imageKey: 'service-automation',
    description: 'High-bay LED retrofits, Power Factor Correction (PFC) units, automated lighting controls, and peak-demand management.',
    specs: [{ label: 'Protocol', value: 'DALI-2 / KNX / Modbus' }, { label: 'Lighting', value: 'Industrial High-Bay LED' }, { label: 'PFC Units', value: 'Automatic Capacitor Bank' }, { label: 'Savings', value: '30%–45% KVA Savings' }],
    features: ['Energy audit and metering', 'LED retrofit design', 'Power factor correction', 'Lighting control integration', 'Savings verification report'],
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

export const OFFICES = [
  { region: 'Gauteng', name: 'Gauteng Main HQ', area: 'Sandton, Johannesburg', address: '14 Commerce Crescent, Eastgate Ext 12, Sandton, 2090', phone: '+27 (11) 987-6500', email: 'jhb.dispatch@psgelectrical.co.za', manager: 'Eng. Johan van der Merwe (Pr. Eng)', hours: 'Mon-Fri: 07:00 - 18:00 | 24/7 Hotline', lat: -26.1087, lng: 28.0676 },
  { region: 'KZN', name: 'KwaZulu-Natal Coastal Office', area: 'Umhlanga, Durban', address: '3 Park Lane, Umhlanga Ridge, 4319', phone: '+27 (31) 555-0140', email: 'kzn.dispatch@psgelectrical.co.za', manager: 'Eng. Nomvula Dlamini (Pr. Tech)', hours: 'Mon-Fri: 07:30 - 17:30 | 24/7 Hotline', lat: -29.7274, lng: 31.0694 },
  { region: 'W. Cape', name: 'Western Cape Depot', area: 'Montague Gardens, Cape Town', address: '21 Marine Drive, Montague Gardens, 7441', phone: '+27 (21) 555-0190', email: 'cpt.dispatch@psgelectrical.co.za', manager: 'Eng. Pieter Louw (Pr. Eng)', hours: 'Mon-Fri: 07:00 - 17:00 | 24/7 Hotline', lat: -33.8622, lng: 18.5231 },
] as const;

export const DEPARTMENTS = [
  { name: 'Industrial & High Voltage Tenders', email: 'tenders@psgelectrical.co.za', phone: '+27 (11) 987-6501', sla: '1-Hour Priority Callback', icon: 'zap' },
  { name: 'Solar Systems & Commercial Microgrids', email: 'solar.projects@psgelectrical.co.za', phone: '+27 (11) 987-6502', sla: '2-Hour Turnaround', icon: 'sparkles' },
  { name: 'Safety & Compliance / C.O.C Audits', email: 'compliance@psgelectrical.co.za', phone: '+27 (11) 987-6503', sla: 'Same-Day Field Inspection', icon: 'shield-check' },
  { name: '24/7 Emergency Technical Support', email: 'emergency@psgelectrical.co.za', phone: '+27 (800) 911-911', sla: 'Immediate Rapid Dispatch', icon: 'siren' },
] as const;

export const FAQS = [
  { category: 'QUOTATION', q: 'How quickly will I receive the official quotation?', a: 'Standard commercial & industrial quotes are processed within 4 business hours. Emergency breakdown and high-voltage requests trigger immediate engineer dispatch.' },
  { category: 'QUOTATION', q: 'Are physical site surveys included?', a: 'Yes. Where the scope cannot be confirmed from photos and drawings, a registered electrician performs a site survey before the binding quotation is issued. Survey fees are credited against accepted work.' },
  { category: 'QUOTATION', q: 'Can I accept or decline a quote in the app?', a: 'Yes. Your quote shows labour, materials, VAT and validity. Accepting it schedules an electrician; declining lets you request an alternative service.' },
  { category: 'COMPLIANCE', q: 'Are all installations issued with an official CoC?', a: 'Yes. Every electrical installation, modification, or solar integration performed by PSG Electrical is inspected by an accredited Master Electrician and issued with a legal Certificate of Compliance (CoC) per SANS 10142-1 standards.' },
  { category: 'COMPLIANCE', q: 'What is your average response time for emergencies?', a: 'High-priority fault callouts are dispatched within 60 minutes across Gauteng, with emergency crews on 24/7 standby.' },
  { category: 'COMPLIANCE', q: 'Is PSG covered by public liability insurance?', a: 'Yes. All site work is covered by public and site liability insurance, and certificates are available on request for tender submissions.' },
  { category: 'CONTACT', q: 'How fast is 24/7 emergency response?', a: 'Emergency calls are triaged immediately and a field team is dispatched — typically on site in under 60 minutes in metropolitan Gauteng.' },
  { category: 'CONTACT', q: 'Can I request an official C.O.C audit?', a: 'Yes. Choose "Certificate of Compliance & Audits" when requesting a service. Most CoC inspections are completed within 24–48 hours.' },
  { category: 'CONTACT', q: 'How do I tender for large industrial contracts?', a: 'Send tender documentation to the Industrial & High Voltage Tenders desk. A project engineer will acknowledge within one business hour.' },
  { category: 'GENERAL', q: 'Do I need an account to browse services?', a: 'No. Services, recent work, partners and team profiles are available without signing in. An account is only needed to request and track jobs.' },
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
