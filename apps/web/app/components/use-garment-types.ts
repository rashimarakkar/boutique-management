'use client';

import { useEffect, useState } from 'react';
import { API, apiFetch } from '../lib/api';

export function useGarmentTypes(enabled: boolean) {
  const [garmentTypes, setGarmentTypes] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiFetch(`${API}/orders/garment-types`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Garment type suggestions could not be loaded.');
        const data = (await response.json()) as unknown;
        if (!Array.isArray(data) || !data.every((item) => typeof item === 'string')) {
          throw new Error('Garment type suggestions returned an invalid response.');
        }
        setGarmentTypes(data);
        setError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Garment type suggestions could not be loaded.');
      });

    return () => controller.abort();
  }, [enabled]);

  return { garmentTypes, garmentTypesError: error };
}
