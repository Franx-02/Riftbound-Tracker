import { Injectable, signal } from '@angular/core';

export interface CardPrice {
  /** Tendencia de Cardmarket en versión normal. null = sin datos (Cardmarket usa 0 para "sin datos"). */
  trend: number | null;
  low: number | null;
  avg7: number | null;
  trendFoil: number | null;
  lowFoil: number | null;
}

export interface PricesResponse {
  updatedAt: string;
  prices: Record<string, CardPrice>;
}

@Injectable({ providedIn: 'root' })
export class PricesService {
  readonly data = signal<PricesResponse | null>(null);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.data.set(await res.json());
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }
}
