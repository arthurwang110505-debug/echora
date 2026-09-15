import React from "react";
import { type VisualizerSharedProps } from "./definition";

// src/components/visualizer/lazyVisualizer.tsx
// Wraps a visualizer mode's default export in React.lazy + Suspense so each mode's
// implementation lands in its own chunk. The registry entries stay synchronous (mode
// menus, tuning bindings and previews keep working), while the player only parses a
// mode's scene code the first time it is actually shown. The fallback is null: the
// shared stage background and subtitle chrome render independently, so a first-load
// frame simply shows the stage without text instead of blocking on a full parse.
export const lazyVisualizer = (
  factory: () => Promise<{
    default: React.ComponentType<VisualizerSharedProps>;
  }>,
) => {
  const Component = React.lazy(factory);
  return (props: VisualizerSharedProps) => (
    <React.Suspense fallback={null}>
      <Component {...props} />
    </React.Suspense>
  );
};
