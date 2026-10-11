import type { Bike, BikeSummary } from '../shared/types';

const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}

export const loadIndex = () => getJson<BikeSummary[]>('index.json');

const bikeCache = new Map<string, Promise<Bike>>();
export function loadBike(id: string): Promise<Bike> {
  if (!bikeCache.has(id)) {
    const p = getJson<Bike>(`bikes/${encodeURIComponent(id)}.json`);
    p.catch(() => bikeCache.delete(id));
    bikeCache.set(id, p);
  }
  return bikeCache.get(id)!;
}
