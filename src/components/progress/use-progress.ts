/** React-хук над клієнтським шаром прогресу: стан для рендера й клієнт для подій. Безпечний для SSR. */
import { useEffect, useState } from 'react';
import { createEmptyProgress, type ProgressState } from '../../engines/progress';
import { getProgressClient, type ProgressClient } from './client';

const SSR_EPOCH = new Date(0);

export interface ProgressHandle {
  readonly state: ProgressState;
  readonly persistent: boolean;
  /** null до гідрації (на сервері). */
  readonly client: ProgressClient | null;
}

export function useProgress(): ProgressHandle {
  const [handle, setHandle] = useState<ProgressHandle>(() => ({ state: createEmptyProgress(SSR_EPOCH), persistent: true, client: null }));

  useEffect(() => {
    const client = getProgressClient();
    setHandle({ state: client.getState(), persistent: client.isPersistent(), client });
    return client.subscribe((detail) => setHandle({ state: detail.state, persistent: detail.persistent, client }));
  }, []);

  return handle;
}
