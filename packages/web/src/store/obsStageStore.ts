import { create } from 'zustand';
import type { ObsStageTransport } from '../obs/protocol';
import { OBS_STAGE_DEFAULT_RELAY } from '../obs/protocol';

// src/store/obsStageStore.ts
//
// Settings for publishing the stage to an external surface (an OBS browser source, or another
// window). Off by default: nothing is sent anywhere until the user turns it on, and the relay
// address defaults to loopback.

const OBS_STAGE_KEY = 'echora.obs-stage';

export interface ObsStageSettings {
    /** Publish the live stage for an overlay to consume. */
    enabled: boolean;
    transport: ObsStageTransport;
    /** `host:port` of the local Stage API relay. */
    relay: string;
    /** Shared secret for the relay; empty means the relay has not been configured yet. */
    token: string;
    /** Draw the overlay without the "waiting for the player" card. */
    quietOverlay: boolean;
}

const DEFAULTS: ObsStageSettings = {
    enabled: false,
    transport: 'relay',
    relay: OBS_STAGE_DEFAULT_RELAY,
    token: '',
    quietOverlay: false,
};

const readStored = (): Partial<ObsStageSettings> => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(OBS_STAGE_KEY) || 'null');
        return parsed && typeof parsed === 'object' ? parsed as Partial<ObsStageSettings> : {};
    } catch {
        return {};
    }
};

const writeStored = (settings: ObsStageSettings) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(OBS_STAGE_KEY, JSON.stringify(settings));
    } catch {
        // Persistence is optional; a full disk must never break playback.
    }
};

type ObsStageState = ObsStageSettings & {
    /** `enabled && (broadcast || relay configured)`: publishing only ever starts when usable. */
    isPublishable: () => boolean;
    setEnabled: (enabled: boolean) => void;
    setTransport: (transport: ObsStageTransport) => void;
    setRelay: (relay: string) => void;
    setToken: (token: string) => void;
    setQuietOverlay: (quietOverlay: boolean) => void;
};

const pickSettings = (state: ObsStageState): ObsStageSettings => ({
    enabled: state.enabled,
    transport: state.transport,
    relay: state.relay,
    token: state.token,
    quietOverlay: state.quietOverlay,
});

export const useObsStageStore = create<ObsStageState>((set, get) => {
    const stored = readStored();
    const initial: ObsStageSettings = {
        ...DEFAULTS,
        ...stored,
        transport: stored.transport === 'broadcast' ? 'broadcast' : 'relay',
        relay: typeof stored.relay === 'string' && stored.relay.trim() ? stored.relay.trim() : DEFAULTS.relay,
        token: typeof stored.token === 'string' ? stored.token : '',
    };
    const persist = (next: Partial<ObsStageSettings>) => {
        set(next);
        writeStored({ ...pickSettings(get()), ...next });
    };

    return {
        ...initial,
        isPublishable: () => {
            const state = get();
            if (!state.enabled) return false;
            return state.transport === 'broadcast' || Boolean(state.relay.trim());
        },
        setEnabled: (enabled) => persist({ enabled }),
        setTransport: (transport) => persist({ transport }),
        setRelay: (relay) => persist({ relay }),
        setToken: (token) => persist({ token }),
        setQuietOverlay: (quietOverlay) => persist({ quietOverlay }),
    };
});
