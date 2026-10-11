// Data model shared by the scraper (producer) and the site (consumer).

export type Category =
  | 'engine'
  | 'intake'
  | 'exhaust'
  | 'cooling'
  | 'fuel'
  | 'electrical'
  | 'frame'
  | 'front-suspension'
  | 'rear-suspension'
  | 'wheels-brakes'
  | 'bodywork'
  | 'controls'
  | 'other';

export interface Price {
  amount: number;
  currency: string;
}

export interface Part {
  /** Reference number on the assembly diagram. */
  ref: string;
  partNo: string;
  description: string;
  qty: number;
  price?: Price;
  buyUrl?: string;
  /** Stock status reported by the source at scrape time. */
  inStock?: boolean;
  notes?: string;
}

export interface Assembly {
  id: string;
  name: string;
  category: Category;
  diagramUrl?: string;
  sourceUrl: string;
  parts: Part[];
}

export interface Bike {
  id: string;
  make: string;
  model: string;
  year: number;
  code: string;
  sourceUrl: string;
  scrapedAt: string;
  assemblies: Assembly[];
}

/** Entry in public/data/index.json — what the search page indexes. */
export interface BikeSummary {
  id: string;
  make: string;
  model: string;
  year: number;
  code: string;
  sourceUrl: string;
  assemblyCount: number;
  partCount: number;
}

export function summarize(bike: Bike): BikeSummary {
  const { id, make, model, year, code, sourceUrl } = bike;
  return {
    id,
    make,
    model,
    year,
    code,
    sourceUrl,
    assemblyCount: bike.assemblies.length,
    partCount: bike.assemblies.reduce((n, a) => n + a.parts.length, 0),
  };
}
