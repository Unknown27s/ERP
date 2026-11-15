import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

export type Branding = {
  product_name: string;
  company_name: string;
  timezone?: string;
  currency?: string;
};

const DEFAULTS: Branding = { product_name: 'MarvelSoftware', company_name: 'MarvelSoftware', timezone: 'Asia/Kolkata', currency: 'INR' };

const Ctx = createContext<{ brand: Branding; refresh: () => void }>({ brand: DEFAULTS, refresh: () => {} });
export const useBranding = () => useContext(Ctx);

/** Company/product name comes from Settings (`/api/config`), never from code. */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<Branding>(DEFAULTS);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api.get('/config')
      .then((r) => { if (alive && r?.data) setBrand({ ...DEFAULTS, ...r.data }); })
      .catch(() => { /* keep defaults until the API is reachable */ });
    return () => { alive = false; };
  }, [tick]);
  useEffect(() => {
    document.title = brand.product_name ? `${brand.product_name} — ERP` : 'MarvelSoftware';
  }, [brand.product_name]);
  return <Ctx.Provider value={{ brand, refresh: () => setTick((t) => t + 1) }}>{children}</Ctx.Provider>;
}
