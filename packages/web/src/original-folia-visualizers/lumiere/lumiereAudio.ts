// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereAudio.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { MotionValue } from 'framer-motion';
import type { AudioBands } from '../../types';
import type { LumiereAudioFrame } from './lumiereKernel';

// src/components/visualizer/lumiere/lumiereAudio.ts
// folia 的音頻 MotionValue → 繪光場景要的 audioAt 幀（bass / treble / power，0..1）。
//
// 量綱：主播放器（usePlaybackVisualizerBridge）寫的是 0..255（getByteFrequencyData 的均值再做 pow 壓縮），
// 沒在出聲時是 0..40 的「呼吸」；VisPlayground / ThemePark 的預覽時鐘與 OBS 的音頻橋寫的是 0..1。
// 同一個源不會混用兩種量綱，所以和 claddagh 一樣按「見過 > 1 的值就認定是 0..255」粘住判斷——
// 單看當前值會把 0..255 源裡安靜段的 0.3 當成 0.3 而不是 0.001。
//
// 平滑：原始頻段值逐幀抖動，直接推光束亮度會閃。起音快（~60ms）、釋放慢（~250ms），跟得上鼓點又不閃。
// 暫停時整幀歸零（場景當作安靜），不讀呼吸值。

export interface LumiereAudioSources {
    audioPower: MotionValue<number>;
    audioBands: AudioBands;
}

export interface LumiereAudioSampler {
    /** 每幀調一次：讀 MotionValue、歸一化、平滑，結果寫進 frame。 */
    sample: (nowMs: number, paused: boolean) => void;
    /** 最近一次 sample 的結果（同一個對象，場景的 audioAt 直接返回它）。 */
    readonly frame: LumiereAudioFrame;
    setSources: (sources: LumiereAudioSources) => void;
}

const ATTACK_SECONDS = 0.06;
const RELEASE_SECONDS = 0.25;

/** 單個值歸一化到 0..1；rawScale 為 true 時按 0..255 換算。 */
export const normalizeLumiereAudioValue = (value: number, rawScale: boolean) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(1, rawScale ? value / 255 : value);
};

/** 一階低通，起音與釋放各自的時間常數；dt 秒。 */
export const smoothLumiereAudioValue = (current: number, target: number, dt: number) => {
    const tau = target > current ? ATTACK_SECONDS : RELEASE_SECONDS;
    const k = 1 - Math.exp(-Math.max(0, dt) / tau);
    return current + (target - current) * k;
};

export const createLumiereAudioSampler = (initial: LumiereAudioSources): LumiereAudioSampler => {
    let sources = initial;
    let rawScale = false;
    let lastMs = 0;
    const frame: LumiereAudioFrame = { bass: 0, treble: 0, power: 0 };

    const read = (value: MotionValue<number> | undefined) => {
        const raw = value?.get() ?? 0;
        if (raw > 1) rawScale = true;
        return raw;
    };

    return {
        frame,
        setSources: next => {
            if (next.audioPower === sources.audioPower && next.audioBands === sources.audioBands) return;
            sources = next;
            rawScale = false;
        },
        sample: (nowMs, paused) => {
            const dt = lastMs > 0 ? Math.min(0.1, (nowMs - lastMs) / 1000) : 1;
            lastMs = nowMs;
            if (paused) {
                frame.bass = 0;
                frame.treble = 0;
                frame.power = 0;
                return;
            }
            // 三個都先讀一遍，量綱判斷對三者一致。
            const bass = read(sources.audioBands.bass);
            const treble = read(sources.audioBands.treble);
            const power = read(sources.audioPower);
            frame.bass = smoothLumiereAudioValue(frame.bass, normalizeLumiereAudioValue(bass, rawScale), dt);
            frame.treble = smoothLumiereAudioValue(frame.treble, normalizeLumiereAudioValue(treble, rawScale), dt);
            frame.power = smoothLumiereAudioValue(frame.power, normalizeLumiereAudioValue(power, rawScale), dt);
        },
    };
};
