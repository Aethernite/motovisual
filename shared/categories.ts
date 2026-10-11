import type { Category } from './types';

// Ordered: first match wins, so specific names come before generic ones
// (e.g. "FUEL TANK" must hit fuel before "TANK" could hit anything else).
const RULES: [Category, RegExp][] = [
  // Gearbox internals mention "FORK"/"LEVER" — claim them before suspension/controls.
  ['engine', /GEAR SHIFT|SHIFT (DRUM|SHAFT|FORK)/],
  ['fuel', /\bFUEL\b|\bTANK\b|FUEL PUMP|INJECT/],
  ['intake', /INTAKE|AIR ?CLEANER|THROTTLE BODY|CARBURE/],
  ['exhaust', /EXHAUST|MUFFLER|SILENCER/],
  ['cooling', /RADIATOR|WATER PUMP|COOLING|OIL COOLER|HOSE/],
  ['front-suspension', /FRONT FORK|STEERING(?! HANDLE)|FORK/],
  ['rear-suspension', /REAR ARM|SWING ?ARM|REAR SUSPENSION|SHOCK|RELAY ARM/],
  ['wheels-brakes', /WHEEL|BRAKE|CALIPER|MASTER CYLINDER|DISC/],
  ['controls', /HANDLE|LEVER|PEDAL|FOOTREST|STAND|CABLE|MIRROR|GRIP/],
  ['electrical', /ELECTRICAL|LIGHT|LAMP|METER|SWITCH|BATTERY|GENERATOR|STARTING MOTOR|STARTER MOTOR|IGNITION|INDICATOR|SPEEDOMETER|WIRE|HARNESS|FLASHER|HORN|SENSOR/],
  ['engine', /CYLINDER|CRANK|PISTON|CAMSHAFT|CHAIN|VALVE|CLUTCH|TRANSMISSION|SHIFT|OIL PUMP|OIL FILTER|BALANCER|ENGINE/],
  ['frame', /FRAME/],
  ['bodywork', /COWLING|FAIRING|FENDER|COVER|SEAT|PANEL|SCREEN|GRAPHIC|EMBLEM|LABEL/],
];

export function categorize(assemblyName: string): Category {
  const name = assemblyName.toUpperCase();
  for (const [cat, re] of RULES) if (re.test(name)) return cat;
  return 'other';
}

export const CATEGORY_LABELS: Record<Category, string> = {
  engine: 'Engine',
  intake: 'Intake',
  exhaust: 'Exhaust',
  cooling: 'Cooling',
  fuel: 'Fuel',
  electrical: 'Electrical',
  frame: 'Frame',
  'front-suspension': 'Front suspension',
  'rear-suspension': 'Rear suspension',
  'wheels-brakes': 'Wheels & brakes',
  bodywork: 'Bodywork',
  controls: 'Controls',
  other: 'Other',
};
