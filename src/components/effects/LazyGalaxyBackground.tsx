import { Suspense, lazy, useEffect, useState } from 'react';

const GalaxyBackground = lazy(() => import('./GalaxyBackground'));

export default function LazyGalaxyBackground({ luminousPoints = false }: { luminousPoints?: boolean }) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const render = () => setShouldRender(true);

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(render, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, []);

  if (!shouldRender) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <GalaxyBackground luminousPoints={luminousPoints} />
    </Suspense>
  );
}
