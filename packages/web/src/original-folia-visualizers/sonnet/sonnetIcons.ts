import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadLucideIcon, resolveLucideIconNames } from '../../utils/lucideIconResolver';

// src/components/visualizer/sonnet/sonnetIcons.ts
// Validates theme icon names and produces cacheable SVG data URLs for Pixi.
//
// The icon components are loaded one file at a time through the shared resolver. This file used to
// do `import * as LucideIcons`, which put all ~2,000 icons (878 kB) into a chunk every Sonnet
// visitor downloaded to rasterise the two or three icons their theme names.

export const resolveSonnetIconNames = (names: string[] | undefined): string[] => {
    const resolved = resolveLucideIconNames(names);
    return resolved.length > 0 ? resolved : ['Flower'];
};

// Spreads icon particles through the scene while guaranteeing every available theme icon is used.
export const buildSonnetIconParticleIndices = (
    iconCount: number,
    particleCount: number,
    seed: number,
): Array<number | null> => {
    const safeIconCount = Math.max(0, Math.floor(iconCount));
    const safeParticleCount = Math.max(0, Math.floor(particleCount));
    if (safeIconCount === 0) {
        return Array.from({ length: safeParticleCount }, () => null);
    }

    const iconParticleCount = Math.min(
        safeParticleCount,
        Math.max(Math.ceil(safeParticleCount / 4), safeIconCount),
    );
    let emittedIconCount = 0;
    return Array.from({ length: safeParticleCount }, (_, index) => {
        const previousBand = Math.floor(index * iconParticleCount / safeParticleCount);
        const currentBand = Math.floor((index + 1) * iconParticleCount / safeParticleCount);
        if (currentBand === previousBand) {
            return null;
        }

        const iconIndex = ((seed + emittedIconCount) % safeIconCount + safeIconCount) % safeIconCount;
        emittedIconCount += 1;
        return iconIndex;
    });
};

// Distributes icon starts across most of a shot while reserving time for the final reveal.
export const resolveSonnetIconEntryPhase = (index: number, iconCount: number) => {
    const safeCount = Math.max(0, Math.floor(iconCount));
    if (safeCount <= 1) return 0.12;
    const safeIndex = Math.min(safeCount - 1, Math.max(0, Math.floor(index)));
    return 0.04 + (safeIndex / (safeCount - 1)) * 0.82;
};

export const resolveSonnetIconEntryDuration = (sceneDuration: number, preferredDuration: number) => {
    const safeSceneDuration = Math.max(0.01, sceneDuration);
    return Math.min(
        Math.max(0.01, preferredDuration),
        Math.max(0.08, safeSceneDuration * 0.18),
        safeSceneDuration,
    );
};

export const resolveSonnetIconEntryDelay = (
    entryPhase: number,
    sceneDuration: number,
    entryDuration: number,
) => Math.min(1, Math.max(0, entryPhase)) * Math.max(0, sceneDuration - entryDuration);

export const buildSonnetIconTextureKey = (
    name: string,
    color: string,
    strokeWidth: number,
    size: number,
    resolution: number,
) => `${name}|${color}|${strokeWidth}|${size}|${resolution}`;

/**
 * Rasterises one icon to an SVG data URL.
 *
 * Async because the icon's component is a separate module now: `acquireIcons` already awaits one
 * promise per icon, so this adds no new waiting to the scene build.
 */
export const buildSonnetIconDataUrl = async (
    name: string,
    color: string,
    strokeWidth: number,
    size: number,
) => {
    const Icon = await loadLucideIcon(name) as React.ElementType | null;
    if (!Icon) return null;
    const markup = renderToStaticMarkup(React.createElement(Icon, {
        size,
        color,
        strokeWidth,
        absoluteStrokeWidth: true,
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
    }));
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
};
