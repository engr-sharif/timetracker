/** Unit tables: factor converts one unit to the SI base of the category. */
export interface UnitDef {
  id: string
  label: string
  factor: number
  offset?: number
}

export const UNIT_CATEGORIES: { id: string; label: string; units: UnitDef[] }[] = [
  {
    id: 'length',
    label: 'Length',
    units: [
      { id: 'mm', label: 'millimetre (mm)', factor: 0.001 },
      { id: 'cm', label: 'centimetre (cm)', factor: 0.01 },
      { id: 'm', label: 'metre (m)', factor: 1 },
      { id: 'km', label: 'kilometre (km)', factor: 1000 },
      { id: 'in', label: 'inch (in)', factor: 0.0254 },
      { id: 'ft', label: 'foot (ft)', factor: 0.3048 },
      { id: 'yd', label: 'yard (yd)', factor: 0.9144 },
      { id: 'mi', label: 'mile (mi)', factor: 1609.344 },
      { id: 'usft', label: 'US survey foot', factor: 1200 / 3937 },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    units: [
      { id: 'mm2', label: 'mm²', factor: 1e-6 },
      { id: 'm2', label: 'm²', factor: 1 },
      { id: 'ha', label: 'hectare', factor: 1e4 },
      { id: 'km2', label: 'km²', factor: 1e6 },
      { id: 'in2', label: 'in²', factor: 0.00064516 },
      { id: 'ft2', label: 'ft²', factor: 0.09290304 },
      { id: 'ac', label: 'acre', factor: 4046.8564224 },
      { id: 'mi2', label: 'mi²', factor: 2589988.110336 },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    units: [
      { id: 'l', label: 'litre (L)', factor: 0.001 },
      { id: 'm3', label: 'm³', factor: 1 },
      { id: 'ft3', label: 'ft³', factor: 0.028316846592 },
      { id: 'yd3', label: 'yd³', factor: 0.764554857984 },
      { id: 'gal', label: 'US gallon', factor: 0.003785411784 },
      { id: 'mgal', label: 'million US gal', factor: 3785.411784 },
      { id: 'acft', label: 'acre-foot', factor: 1233.48183754752 },
    ],
  },
  {
    id: 'flow',
    label: 'Flow',
    units: [
      { id: 'm3s', label: 'm³/s', factor: 1 },
      { id: 'ls', label: 'L/s', factor: 0.001 },
      { id: 'm3d', label: 'm³/day', factor: 1 / 86400 },
      { id: 'cfs', label: 'ft³/s (cfs)', factor: 0.028316846592 },
      { id: 'gpm', label: 'US gpm', factor: 0.003785411784 / 60 },
      { id: 'mgd', label: 'MGD', factor: 3785.411784 / 86400 },
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure / stress',
    units: [
      { id: 'pa', label: 'pascal (Pa)', factor: 1 },
      { id: 'kpa', label: 'kPa', factor: 1e3 },
      { id: 'mpa', label: 'MPa (N/mm²)', factor: 1e6 },
      { id: 'bar', label: 'bar', factor: 1e5 },
      { id: 'psi', label: 'psi', factor: 6894.757293168 },
      { id: 'ksi', label: 'ksi', factor: 6894757.293168 },
      { id: 'psf', label: 'psf', factor: 47.880258980336 },
      { id: 'ksf', label: 'ksf', factor: 47880.258980336 },
      { id: 'ftwater', label: 'ft of water', factor: 2989.0669 },
      { id: 'mwater', label: 'm of water', factor: 9806.65 },
    ],
  },
  {
    id: 'force',
    label: 'Force',
    units: [
      { id: 'n', label: 'newton (N)', factor: 1 },
      { id: 'kn', label: 'kN', factor: 1e3 },
      { id: 'lbf', label: 'pound-force (lbf)', factor: 4.4482216152605 },
      { id: 'kip', label: 'kip', factor: 4448.2216152605 },
      { id: 'tonf', label: 'short ton-force', factor: 8896.443230521 },
      { id: 'kgf', label: 'kilogram-force', factor: 9.80665 },
    ],
  },
  {
    id: 'moment',
    label: 'Moment',
    units: [
      { id: 'nm', label: 'N·m', factor: 1 },
      { id: 'knm', label: 'kN·m', factor: 1e3 },
      { id: 'lbft', label: 'lb·ft', factor: 1.3558179483314 },
      { id: 'kipft', label: 'kip·ft', factor: 1355.8179483314 },
      { id: 'kipin', label: 'kip·in', factor: 112.98482902762 },
    ],
  },
  {
    id: 'distload',
    label: 'Line load',
    units: [
      { id: 'knm', label: 'kN/m', factor: 1e3 },
      { id: 'nmm', label: 'N/mm', factor: 1e3 },
      { id: 'plf', label: 'lb/ft (plf)', factor: 14.593902937206 },
      { id: 'klf', label: 'kip/ft (klf)', factor: 14593.902937206 },
    ],
  },
  {
    id: 'density',
    label: 'Density / unit weight',
    units: [
      { id: 'kgm3', label: 'kg/m³', factor: 1 },
      { id: 'knm3', label: 'kN/m³', factor: 1000 / 9.80665 },
      { id: 'pcf', label: 'lb/ft³ (pcf)', factor: 16.018463373960138 },
    ],
  },
  {
    id: 'velocity',
    label: 'Velocity',
    units: [
      { id: 'ms', label: 'm/s', factor: 1 },
      { id: 'kmh', label: 'km/h', factor: 1 / 3.6 },
      { id: 'fts', label: 'ft/s', factor: 0.3048 },
      { id: 'mph', label: 'mph', factor: 0.44704 },
      { id: 'kn', label: 'knot', factor: 0.514444 },
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    units: [
      { id: 'kg', label: 'kilogram', factor: 1 },
      { id: 't', label: 'tonne', factor: 1000 },
      { id: 'lb', label: 'pound', factor: 0.45359237 },
      { id: 'ton', label: 'short ton', factor: 907.18474 },
    ],
  },
  {
    id: 'temp',
    label: 'Temperature',
    units: [
      { id: 'c', label: '°C', factor: 1, offset: 0 },
      { id: 'f', label: '°F', factor: 5 / 9, offset: -32 },
      { id: 'k', label: 'K', factor: 1, offset: -273.15 },
    ],
  },
]

export function convert(value: number, from: UnitDef, to: UnitDef) {
  const base = (value + (from.offset ?? 0)) * from.factor
  return base / to.factor - (to.offset ?? 0)
}
