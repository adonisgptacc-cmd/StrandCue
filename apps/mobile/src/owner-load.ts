import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

export type OwnerLoadMode = 'initial' | 'refresh' | 'append';

type OwnerLoadOptions<Result> = Readonly<{
  ownerKey: string;
  load: (mode: OwnerLoadMode) => Promise<Result>;
  apply: (result: Result, mode: OwnerLoadMode) => void;
  handleError: (error: unknown, mode: OwnerLoadMode) => void;
  clearError: () => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  preventOverlap?: boolean;
}>;

export function useOwnerLoad<Result>(options: OwnerLoadOptions<Result>) {
  const callbacks = useRef(options);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    callbacks.current = options;
  });

  const begin = useCallback((preventOverlap = false) => {
    if (!mounted.current || (preventOverlap && busy.current)) return null;
    busy.current = true;
    return ++generation.current;
  }, []);

  const isCurrent = useCallback((request: number) => (
    mounted.current && request === generation.current
  ), []);

  const finish = useCallback((request: number) => {
    if (request === generation.current) busy.current = false;
  }, []);

  const isMounted = useCallback(() => mounted.current, []);

  const invalidate = useCallback(() => {
    mounted.current = false;
    busy.current = false;
    ++generation.current;
  }, []);

  const run = useCallback(async (mode: OwnerLoadMode = 'refresh') => {
    const current = callbacks.current;
    const request = begin(current.preventOverlap);
    if (request === null) return;
    current.setLoading(true);
    if (mode !== 'initial') current.clearError();

    try {
      const result = await current.load(mode);
      if (isCurrent(request)) current.apply(result, mode);
    } catch (error) {
      if (isCurrent(request)) current.handleError(error, mode);
    } finally {
      finish(request);
      if (isCurrent(request)) current.setLoading(false);
    }
  }, [begin, finish, isCurrent]);

  useEffect(() => {
    mounted.current = true;
    void run('initial');
    return invalidate;
  }, [invalidate, options.ownerKey, run]);

  return { begin, finish, isCurrent, isMounted, run };
}
