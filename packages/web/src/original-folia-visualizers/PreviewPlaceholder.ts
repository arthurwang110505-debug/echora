import { type Line, type VisualizerMode } from '../types';
import { getLineRenderEndTime } from '../utils/lyrics/renderHints';
import { getVisualizerPreviewStartOffset } from './registry';

// Preview-only placeholder covers. The original Folia assets were not copied into
// this tree; generate lightweight inline SVG data URLs so the playground resolves
// without bundling binary assets.
const createPlaceholderCoverUrl = (from: string, to: string, label: string): string =>
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
            `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
            `</linearGradient></defs><rect width="600" height="600" fill="url(#g)"/>` +
            `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" ` +
            `font-family="sans-serif" font-size="64" font-weight="700" fill="rgba(255,255,255,0.92)">${label}</text>` +
            `</svg>`,
    )}`;

const placeholderCoverUrl = createPlaceholderCoverUrl('#1b2a4a', '#62f5c4', '神文之诗');
const placeholderCover2Url = createPlaceholderCoverUrl('#3a1b4a', '#f5c462', '野芝麻');

const createCharacterWords = (text: string, startTime: number, endTime: number) => {
    const chars = Array.from(text);
    const duration = endTime - startTime;

    return chars.map((char, index) => {
        const charStart = startTime + duration * (index / chars.length);
        const charEnd = startTime + duration * ((index + 1) / chars.length);

        return {
            text: char,
            startTime: charStart,
            endTime: charEnd,
        };
    });
};

const createTokenWords = (tokens: string[], startTime: number, endTime: number) => {
    const duration = endTime - startTime;

    return tokens.map((token, index) => ({
        text: token,
        startTime: startTime + duration * (index / tokens.length),
        endTime: startTime + duration * ((index + 1) / tokens.length),
    }));
};

const DEFAULT_PREVIEW_PLACEHOLDER_LINES: Line[] = [
    {
        startTime: 0.7,
        endTime: 3.6,
        fullText: '詩情を持たずとも、あなたを現実へと導くその神文の詩を紡ぐ。',
        translation: '编织那没有诗意，却能将你带到现实的神文之诗。',
        romanization: 'Shijō o motazu tomo, anata o genjitsu e to michibiku sono shinbun no shi o tsumugu.',
        words: createCharacterWords('詩情を持たずとも、あなたを現実へと導くその神文の詩を紡ぐ。', 0.7, 3.6),
        backgroundVocal: {
            text: 'of course i still love you',
            startTime: 1.3,
            endTime: 3.1,
            words: createTokenWords(['of', 'course', 'i', 'still', 'love', 'you'], 1.3, 3.1),
            translation: '当然，我依然爱你。',
            romanization: 'of course i still love you',
        },
    },
    {
        startTime: 4.2,
        endTime: 7.2,
        fullText: 'Weave that prosaic divine poem that leads you to reality.',
        translation: '编织那没有诗意，却能将你带到现实的神文之诗。',
        romanization: 'Weave that prosaic divine poem that leads you to reality.',
        words: createTokenWords(
            ['Weave', 'that', 'prosaic', 'divine', 'poem', 'that', 'leads', 'you', 'to', 'reality.'],
            4.2,
            7.2,
        ),
        backgroundVocal: {
            text: 'もちろん、今でもあなたを愛してるよ',
            startTime: 4.8,
            endTime: 6.6,
            words: createCharacterWords('もちろん、今でもあなたを愛してるよ', 4.8, 6.6),
            translation: '当然，我依然爱你。',
            romanization: 'Mochiron, ima demo anata o aishiteru yo.',
        },
    },
    {
        startTime: 7.8,
        endTime: 10.9,
        fullText: 'Tisse ce poème divin sans poésie qui te mène au réel.',
        translation: '编织那没有诗意，却能将你带到现实的神文之诗。',
        romanization: 'Tisse ce poème divin sans poésie qui te mène au réel.',
        words: createTokenWords(
            ['Tisse', 'ce', 'poème', 'divin', 'sans', 'poésie', 'qui', 'te', 'mène', 'au', 'réel.'],
            7.8,
            10.9,
        ),
        backgroundVocal: {
            text: 'もちろん、今でもあなたを愛してるよ',
            startTime: 8.4,
            endTime: 10.2,
            words: createCharacterWords('もちろん、今でもあなたを愛してるよ', 8.4, 10.2),
            translation: '当然，我依然爱你。',
            romanization: 'Mochiron, ima demo anata o aishiteru yo.',
        },
    },
    {
        startTime: 11.5,
        endTime: 14.4,
        fullText: '编织那没有诗意，却能将你带到现实的神文之诗。',
        translation: '编织那没有诗意，却能将你带到现实的神文之诗。',
        romanization: 'Biānzhī nà méiyǒu shīyì, què néng jiāng nǐ dài dào xiànshí de shénwén zhī shī.',
        words: createCharacterWords('编织那没有诗意，却能将你带到现实的神文之诗。', 11.5, 14.4),
    },
];

const WILD_SESAME_PREVIEW_PLACEHOLDER_LINES: Line[] = [
    {
        startTime: 0,
        endTime: 3.1,
        fullText: 'You and the others who think',
        translation: '你和那些自以为如此的人',
        romanization: 'You and the others who think',
        words: createTokenWords(['You', 'and', 'the', 'others', 'who', 'think'], 0, 3.1),
    },
    {
        startTime: 3.6,
        endTime: 6.9,
        fullText: '真実のために生きていると思う人たち、',
        translation: '那些自以为为真理而活的人，',
        romanization: 'Shinjitsu no tame ni ikite iru to omou hitotachi,',
        words: createCharacterWords('真実のために生きていると思う人たち、', 3.6, 6.9),
        backgroundVocal: {
            text: 'Soon this will all feel like a distant dream.',
            startTime: 4.2,
            endTime: 6.6,
            words: createTokenWords(['Soon', 'this', 'will', 'all', 'feel', 'like', 'a', 'distant', 'dream.'], 4.2, 6.6),
            translation: '很快，这一切都会像一场遥远的梦。',
            romanization: 'Soon this will all feel like a distant dream.',
        },
    },
    {
        startTime: 7.4,
        endTime: 10.3,
        fullText: 'et, par extension, qui aiment',
        translation: '并因此爱上一切……',
        romanization: 'et, par extension, ki em',
        words: createTokenWords(['et,', 'par', 'extension,', 'qui', 'aiment'], 7.4, 10.3),
    },
    {
        startTime: 10.8,
        endTime: 13.6,
        fullText: '一切冰冷的事物。',
        translation: 'all that is cold.',
        romanization: 'Yīqiè bīnglěng de shìwù.',
        words: createCharacterWords('一切冰冷的事物。', 10.8, 13.6),
    },
];

export type PreviewPlaceholderId = 'default' | 'reserved';

export interface PreviewPlaceholder {
    id: PreviewPlaceholderId;
    title: string;
    lines: Line[];
    loopDuration: number;
    coverUrl: string;
}

export const VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS: Record<PreviewPlaceholderId, PreviewPlaceholder> = {
    default: {
        id: 'default',
        title: '神文之诗',
        lines: DEFAULT_PREVIEW_PLACEHOLDER_LINES,
        loopDuration: 14.4,
        coverUrl: placeholderCoverUrl,
    },
    reserved: {
        id: 'reserved',
        title: '野芝麻',
        lines: WILD_SESAME_PREVIEW_PLACEHOLDER_LINES,
        loopDuration: 13.6,
        coverUrl: placeholderCover2Url,
    },
};

export const VIS_PLAYGROUND_PREVIEW_LINES = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default.lines;
export const VIS_PLAYGROUND_PREVIEW_LOOP_DURATION = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default.loopDuration;
export const VIS_PLAYGROUND_PREVIEW_COVER_URL = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default.coverUrl;

export const getPreviewPlaceholderStartOffset = (mode: VisualizerMode, loopDuration: number) =>
    getVisualizerPreviewStartOffset(mode, loopDuration);

export const findPreviewPlaceholderLineIndex = (lines: Line[], time: number) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line || time < line.startTime) {
            continue;
        }

        if (time <= getLineRenderEndTime(line)) {
            return index;
        }
    }

    return -1;
};
