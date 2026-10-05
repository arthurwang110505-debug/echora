import { useEffect, useRef, useState } from 'react';
import {
    OBS_STAGE_EVENT_CLOCK,
    OBS_STAGE_EVENT_CONFIG,
    buildObsStageEventsUrl,
    type ObsStageClock,
    type ObsStageConfig,
    type ObsStageConnectionStatus,
    type ObsStageOverlayParams,
    type ObsStagePublishMessage,
} from './protocol';
import { OBS_STAGE_BROADCAST_CHANNEL } from './broadcast';

// src/obs/useObsStageSource.ts
//
// The overlay's receive side. Two transports deliver the same two messages:
//
//   relay      EventSource against the local Stage API relay. Works across browser profiles, which
//              is what an OBS browser source needs (it runs in its own Chromium profile and shares
//              neither BroadcastChannel nor storage with the player tab).
//   broadcast  BroadcastChannel on the same origin. Zero setup: open the overlay in a second tab or
//              window of the same browser and capture that window instead of using a browser source.
//
// Reconnects are the transport's job: EventSource retries on its own, and a BroadcastChannel has
// nothing to reconnect. What this hook does own is telling the stage when the source went quiet, so
// a closed player tab does not leave a frozen frame on stream.

export interface ObsStageSourceState {
    status: ObsStageConnectionStatus;
    config: ObsStageConfig | null;
    clock: ObsStageClock | null;
    /** Set when the transport itself failed (the relay is not running, the token is wrong). */
    error: string | null;
}

const applyMessage = (
    message: ObsStagePublishMessage,
    setState: (updater: (previous: ObsStageSourceState) => ObsStageSourceState) => void,
) => {
    if (message.kind === 'config') {
        setState(previous => ({
            ...previous,
            status: 'connected',
            error: null,
            config: message.config,
            // A new config is a new timeline: the old clock would place it at the wrong position.
            clock: previous.config && previous.config.song?.title !== message.config.song?.title ? null : previous.clock,
        }));
        return;
    }
    setState(previous => ({ ...previous, status: 'connected', error: null, clock: message.clock }));
};

export const useObsStageSource = (params: ObsStageOverlayParams): ObsStageSourceState => {
    const [state, setState] = useState<ObsStageSourceState>({
        status: 'idle',
        config: null,
        clock: null,
        error: null,
    });
    const paramsRef = useRef(params);
    paramsRef.current = params;

    useEffect(() => {
        const { transport, relay, token } = paramsRef.current;
        setState(previous => ({ ...previous, status: 'connecting', error: null }));

        if (transport === 'broadcast') {
            if (typeof BroadcastChannel === 'undefined') {
                setState({ status: 'error', config: null, clock: null, error: 'BroadcastChannel is unavailable' });
                return undefined;
            }
            const channel = new BroadcastChannel(OBS_STAGE_BROADCAST_CHANNEL);
            channel.onmessage = event => {
                const message = event.data as ObsStagePublishMessage | undefined;
                if (!message || typeof message !== 'object') return;
                if (message.kind !== 'config' && message.kind !== 'clock') return;
                applyMessage(message, setState);
            };
            // Nothing to probe: a channel with no publisher just stays silent, which the stale-check
            // reports after the timeout.
            setState(previous => ({ ...previous, status: 'connected' }));
            return () => channel.close();
        }

        if (typeof EventSource === 'undefined') {
            setState({ status: 'error', config: null, clock: null, error: 'EventSource is unavailable' });
            return undefined;
        }

        const source = new EventSource(buildObsStageEventsUrl(relay, token));
        const onMessage = (event: MessageEvent<string>, kind: 'config' | 'clock') => {
            try {
                const parsed = JSON.parse(event.data) as ObsStageConfig | ObsStageClock;
                applyMessage(
                    kind === 'config'
                        ? { kind: 'config', config: parsed as ObsStageConfig }
                        : { kind: 'clock', clock: parsed as ObsStageClock },
                    setState,
                );
            } catch {
                // A malformed frame is the publisher's bug; stay connected and ignore it.
            }
        };
        const onConfig = (event: MessageEvent<string>) => onMessage(event, 'config');
        const onClock = (event: MessageEvent<string>) => onMessage(event, 'clock');
        source.addEventListener(OBS_STAGE_EVENT_CONFIG, onConfig as EventListener);
        source.addEventListener(OBS_STAGE_EVENT_CLOCK, onClock as EventListener);
        source.onopen = () => setState(previous => ({ ...previous, status: 'connected', error: null }));
        source.onerror = () => setState(previous => (
            previous.status === 'connected'
                // EventSource retries by itself; the overlay keeps the last frame until the clock
                // goes stale rather than flashing an error on a single dropped connection.
                ? { ...previous, status: 'connecting' }
                : { ...previous, status: 'error', error: 'relay unreachable' }
        ));

        return () => {
            source.removeEventListener(OBS_STAGE_EVENT_CONFIG, onConfig as EventListener);
            source.removeEventListener(OBS_STAGE_EVENT_CLOCK, onClock as EventListener);
            source.close();
        };
    }, []);

    // Liveness: the source going quiet must be visible, because a frozen stage on stream looks like
    // a broken app. Checked on a slow timer; the cost is nothing next to a rendered frame.
    useEffect(() => {
        const timer = window.setInterval(() => {
            setState(previous => {
                if (!previous.clock) return previous;
                const stale = Date.now() - previous.clock.sentAtMs > 4000;
                const status: ObsStageConnectionStatus = stale
                    ? 'error'
                    : previous.status === 'error' ? 'connected' : previous.status;
                const error = stale ? 'player stopped sending' : previous.error;
                if (status === previous.status && error === previous.error) return previous;
                return { ...previous, status, error };
            });
        }, 2000);
        return () => window.clearInterval(timer);
    }, []);

    return state;
};
