import type { LyricData, Song } from '@echora/core';

export interface LocalDemoAttribution {
  creator: string;
  licenseLabel: string;
  sourceUrl: string;
}

export interface LocalDemoSong extends Song {
  source: 'local';
  attribution: LocalDemoAttribution;
}

const showcaseAlbum = { id: 'echora-pixabay-showcase', name: 'Echora 本機展示' };

export type TranscriptSegment = readonly [startSeconds: number, endSeconds: number, text: string];

const countTimingCharacters = (text: string) => Array.from(text.replace(/[\s\p{P}\p{S}]/gu, '')).length;

const getTimingWeight = (text: string) => Math.max(1, countTimingCharacters(text) || Array.from(text.trim()).length || 1);

const splitTranscriptText = (text: string, targetCount: number): string[] => {
  let chunks = [text.trim()].filter(Boolean);
  const punctuationPattern = /(?<=[。！？.!?、，,；;])\s*/u;
  while (chunks.length < targetCount) {
    const largestIndex = chunks.reduce((bestIndex, chunk, index, all) => getTimingWeight(chunk) > getTimingWeight(all[bestIndex]) ? index : bestIndex, 0);
    const candidate = chunks[largestIndex];
    const punctuationParts = candidate.split(punctuationPattern).map(part => part.trim()).filter(Boolean);
    if (punctuationParts.length > 1) {
      chunks.splice(largestIndex, 1, ...punctuationParts);
      continue;
    }
    const graphemes = Array.from(candidate);
    if (graphemes.length < 4) break;
    const midpoint = Math.floor(graphemes.length / 2);
    const whitespaceBoundary = candidate.slice(0, midpoint).lastIndexOf(' ');
    const splitIndex = whitespaceBoundary > 0 ? whitespaceBoundary : midpoint;
    chunks.splice(largestIndex, 1, candidate.slice(0, splitIndex).trim(), candidate.slice(splitIndex).trim());
    chunks = chunks.filter(Boolean);
  }
  return chunks;
};

/**
 * Split coarse speech-to-text segments without inventing lyric text. The source segment's exact start/end
 * remains the outer boundary; only the interior is allocated by semantic chunk weight for smoother display.
 */
export function refineTranscriptSegments(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  return segments.flatMap(([start, end, text]) => {
    const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
    const safeEnd = Number.isFinite(end) ? Math.max(safeStart, end) : safeStart;
    const duration = safeEnd - safeStart;
    const targetCount = Math.min(4, Math.max(1, Math.ceil(Math.max(getTimingWeight(text) / 18, duration / 5.5))));
    const chunks = splitTranscriptText(text, targetCount);
    if (chunks.length <= 1) return [[safeStart, safeEnd, text.trim()] as TranscriptSegment];

    const totalWeight = chunks.reduce((total, chunk) => total + getTimingWeight(chunk), 0);
    let cursor = safeStart;
    return chunks.map((chunk, index) => {
      const chunkEnd = index === chunks.length - 1
        ? safeEnd
        : cursor + duration * getTimingWeight(chunk) / totalWeight;
      const result: TranscriptSegment = [cursor, chunkEnd, chunk];
      cursor = chunkEnd;
      return result;
    });
  });
}

function createLine(startSeconds: number, endSeconds: number, fullText: string, wordsArray: string[]) {
  const startTime = Math.round(startSeconds * 1000);
  const endTime = Math.round(endSeconds * 1000);
  const totalDuration = Math.max(0, endTime - startTime);
  const wordWeights = wordsArray.map(getTimingWeight);
  const totalWeight = wordWeights.reduce((total, weight) => total + weight, 0) || 1;
  let cursor = startTime;
  const words = wordsArray.map((text, index) => {
    const wordEnd = index === wordsArray.length - 1
      ? endTime
      : Math.round(startTime + totalDuration * (wordWeights.slice(0, index + 1).reduce((total, weight) => total + weight, 0) / totalWeight));
    const word = { text, startTime: cursor, endTime: Math.max(cursor, wordEnd) };
    cursor = word.endTime;
    return word;
  });

  return { fullText, startTime, endTime, words };
}

function splitTranscriptWords(text: string) {
  if (/[^\x00-\x7F]/u.test(text)) {
    try {
      const segments = typeof Intl !== 'undefined' && Intl.Segmenter
        ? Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(text))
            .filter(segment => segment.isWordLike)
            .map(segment => segment.segment.trim())
            .filter(Boolean)
        : [];
      if (segments.length > 1) return segments;
    } catch {
      // Older browsers can use the grapheme fallback below.
    }
    const graphemes = Array.from(text).filter(character => !/\s/u.test(character));
    return graphemes.length > 1 ? graphemes : [text];
  }
  return text.match(/\S+/gu) || [text];
}

function createTranscribedLyrics(title: string, artist: string, segments: readonly TranscriptSegment[]): LyricData {
  return {
    title,
    artist,
    isWordByWord: true,
    lines: refineTranscriptSegments(segments).map(([start, end, text]) => createLine(start, end, text, splitTranscriptWords(text))),
    availability: 'available',
  };
}

export const LOCAL_DEMO_SONGS: LocalDemoSong[] = [
  {
    id: 'demo-dancing-in-the-stardust',
    title: 'Dancing in the Stardust',
    artists: [{ id: 'freesoundserver', name: 'Free Sound Server' }],
    album: showcaseAlbum,
    durationMs: 118440,
    coverUrl: '/covers/dancing-in-the-stardust.webp',
    audioUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663524799294/tDiAzOyrXMtgfJhq.mp3',
    source: 'local',
    isPureMusic: false,
    attribution: {
      creator: 'Free Sound Server',
      licenseLabel: 'Pixabay Content License',
      sourceUrl: 'https://pixabay.com/music/pop-dancing-in-the-stardust-free-music-no-copyright-203603/',
    },
  },
  {
    id: 'demo-blue-knot',
    title: 'Blue Knot',
    artists: [{ id: 'yoshiyuki_tatsuya', name: 'Yoshiyuki Tatsuya' }],
    album: showcaseAlbum,
    durationMs: 175032,
    coverUrl: '/covers/blue-knot.webp',
    audioUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663524799294/cgebEptTCRfxgpKp.mp3',
    source: 'local',
    isPureMusic: false,
    attribution: {
      creator: 'Yoshiyuki Tatsuya',
      licenseLabel: 'Pixabay License',
      sourceUrl: 'https://pixabay.com/music/blue-knot-578367/',
    },
  },
  {
    id: 'demo-sun-beneath-a-song',
    title: 'Sun Beneath a Song',
    artists: [{ id: 'suryanatta', name: 'Suryanatta' }],
    album: showcaseAlbum,
    durationMs: 205536,
    coverUrl: '/covers/sun-beneath-a-song.webp',
    audioUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663524799294/LtNbhIIjpeGNszlP.mp3',
    source: 'local',
    isPureMusic: false,
    attribution: {
      creator: 'Suryanatta',
      licenseLabel: 'Pixabay Content License',
      sourceUrl: 'https://pixabay.com/music/acoustic-group-sun-beneath-a-song-410790/',
    },
  },
  {
    id: 'demo-stardust-pop-idol',
    title: 'Stardust Pop Idol',
    artists: [{ id: 'kaazoom', name: 'Kaazoom' }],
    album: showcaseAlbum,
    durationMs: 251184,
    coverUrl: '/covers/stardust-pop-idol.webp',
    audioUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663524799294/TxNMTIzdSSWKkbMY.mp3',
    source: 'local',
    isPureMusic: false,
    attribution: {
      creator: 'Kaazoom',
      licenseLabel: 'Pixabay Content License',
      sourceUrl: 'https://pixabay.com/music/stardust-pop-idol-japanese-edm-fusion-song-female-vocals-471945/',
    },
  },
  {
    id: 'demo-ocean-morning',
    title: 'Ocean Morning (Japanese Ver.)',
    artists: [{ id: 'tideblue', name: 'tideblue' }],
    album: showcaseAlbum,
    durationMs: 188832,
    coverUrl: '/covers/ocean-morning.webp',
    audioUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663524799294/DIrpYlnunrVgXDna.mp3',
    source: 'local',
    isPureMusic: false,
    attribution: {
      creator: 'tideblue',
      licenseLabel: 'Pixabay Content License',
      sourceUrl: 'https://pixabay.com/music/ocean-morning-japanese-ver-chill-rampb-521267/',
    },
  },
];

/**
 * These lines are exhibition transcriptions generated from each matching audio file.
 * They are not presented as official lyric sheets; replace them with creator-confirmed
 * LRC/VTT files if the authors provide formal lyric text and timing.
 */
export const LOCAL_DEMO_LYRICS: Record<string, LyricData> = {
  'demo-dancing-in-the-stardust': createTranscribedLyrics('Dancing in the Stardust', 'Free Sound Server', [
    [0.3, 7.0, 'In the midnight glow where the stars align, we lose ourselves in the rhythm divine.'],
    [7.0, 14.7, "Underneath the sky painted with dreams, we're chasing the echoes of silent screams."],
    [14.7, 18.2, 'Caught in the spell of the cosmic night.'],
    [18.2, 21.7, 'Where fantasies bloom in the pale moonlight.'],
    [21.7, 24.5, "We'll let go of all that we know."],
    [24.5, 28.8, "And dance in the stardust's gentle flow."],
    [28.8, 33.3, "Dancing in the stardust, we're weightless and free."],
    [33.3, 36.5, 'In a world of wonders, just you and me.'],
    [36.5, 41.2, 'Lost in the moment, our spirits ignite.'],
    [41.2, 46.9, 'As we twirl in the magic of the cosmic light.'],
    [46.9, 51.7, "Among constellations, we'll find our way."],
    [51.7, 55.3, "Through this celestial symphony, we'll sway."],
    [55.3, 59.4, 'With every step, we leave our cares behind.'],
    [59.4, 65.8, "In this celestial ballroom, love's defined."],
    [65.8, 72.0, 'Caught in the spell of the cosmic night.'],
    [72.0, 75.5, 'Where fantasies bloom in the pale moonlight.'],
    [75.5, 79.8, "Dancing in the stardust, we're weightless and free."],
    [79.8, 83.1, 'In a world of wonders, just you and me.'],
    [83.1, 87.4, 'Lost in the moment, our spirits ignite.'],
    [87.4, 93.5, 'As we twirl in the magic of the cosmic light.'],
    [93.5, 98.0, "In shimmering galaxies, we'll find our way."],
    [98.0, 104.0, "Guided by love's everlasting sway."],
    [104.0, 107.4, "With each celestial heartbeat, we'll dance on."],
    [107.4, 110.7, 'In this cosmic date.'],
    [110.7, 116.0, 'As we twirl in the magic of the cosmic light.'],
  ]),
  'demo-blue-knot': createTranscribedLyrics('Blue Knot', 'Yoshiyuki Tatsuya', [
    [8.88, 19.42, 'まだ小さな夢のままで。答えなんて見えなくても。遠回りばかりして'],
    [19.42, 29.68, '。ため息を数えてた。昨日より少しだけ前を向けたな'],
    [29.74, 39.879, 'ら。それだけで今日は悪くないよね。風に揺れる'],
    [39.94, 50.08, '青いリボン。ほどけそうでもう一度結び直した。転んでも笑える日まで。少し'],
    [50.08, 60.1, 'ずつ歩いていこう。青い結び目胸に結んで。まだ知らない明日へ行こう。迷'],
    [60.1, 70.56, 'っても泣いた夜も。きっと私になるから。怖くても信'],
    [70.56, 81.22, 'じてみよう。この一歩は消えないから。青い空へ手を伸ばして。未来はここか'],
    [81.22, 91.479, 'ら始まる。大人になればきっ'],
    [91.48, 101.52, 'と違う景色が待ってるかな。うまくいかない日も増えてゆく'],
    [101.52, 111.76, 'のかな。それでも今の私を忘れたくない。まっすぐなこ'],
    [111.76, 121.84, 'の気持ちを抱きしめたい。答えはまだ見えなくていい。今日と'],
    [121.84, 131.9, 'いうページをめくるたびに。少しずつ少しずつ'],
    [131.9, 141.98, '私になれるから。青い結び目ほどけないように。夢を何度も結び直そ'],
    [141.98, 152.1, 'う。遠回りも涙の日々も。全部未来へ続いてる。信じ'],
    [152.1, 162.32, 'ること、それだけでも。世界は少し輝くから。青い風が笑ったなら。ま'],
    [162.32, 165.18, 'た歩き出せるよ。'],
  ]),
  'demo-sun-beneath-a-song': createTranscribedLyrics('Sun Beneath a Song', 'Suryanatta', [
    [8.0, 12.5, 'I hear a glow in the quiet air.'],
    [12.5, 17.12, "A secret warmth that's always there."],
    [17.12, 21.68, 'Notes unfold like a rising flame.'],
    [21.68, 26.46, 'Every chord remembers your name.'],
    [26.46, 33.3, 'It burns so soft where the shadows fall.'],
    [33.3, 39.88, 'A hidden fire that outshines all.'],
    [39.88, 50.56, 'The sun beneath a song, shining where the night is long.'],
    [50.56, 56.1, 'A golden light that hides in sound.'],
    [56.1, 61.02, 'A quiet blaze the world has found.'],
    [61.02, 69.1, 'The sun beneath a song, where broken hearts belong.'],
    [69.1, 79.36, 'Each refrain holds a spark inside.'],
    [81.28, 85.86, "A gentle truth the dark can't hide."],
    [85.86, 89.52, 'Even silence can hum along.'],
    [89.52, 95.9, 'Carrying the sun beneath a song.'],
    [95.9, 108.52, 'Through every tear, through every scar, the melody shows where we are.'],
    [108.52, 118.92, 'The sun beneath a song, shining where the night is long.'],
    [118.92, 124.74, 'A golden light that hides in sound.'],
    [124.74, 129.58, 'A quiet blaze the world has found.'],
    [129.58, 138.16, 'The sun beneath a song, where broken hearts belong.'],
    [138.16, 149.5, 'If the sky should turn to stone, the music still will guide us home.'],
    [149.5, 153.1, 'Not in words, but in its glow.'],
    [153.1, 159.74, 'The secret sun the soul will know.'],
    [159.74, 169.44, 'The sun beneath a song, shining where we still are strong.'],
    [169.44, 174.46, 'Through the dark it carries on.'],
    [174.46, 178.92, 'The sun beneath a song.'],
    [178.92, 184.72, 'Ooh, ooh.'],
    [184.72, 190.78, 'A quiet fire that forever stays.'],
    [190.78, 195.07, 'The sun beneath a song.'],
  ]),
  'demo-stardust-pop-idol': createTranscribedLyrics('Stardust Pop Idol', 'Kaazoom', [
    [14.66, 24.72, 'まだ鏡の前で一人ポーズ決めてる。ヘアブラシをマイクにしてステージ'],
    [24.72, 35.6, '想像してる。スクロールするタイムライン。キラキラの誰かの笑顔。次'],
    [35.6, 45.72, 'は私の番だよって胸の奥で叫んでる。STARDOM POP IDOL。'],
    [45.92, 55.94, 'このステージで光になれ。手を伸ばしてジャンプして星をつかみに行こう'],
    [55.94, 66.78, '。Wow Wow。STARDOM POP IDOL。名前呼ぶ声、風になる。泣き虫だった昨日まで'],
    [66.78, 76.78, '。全部全部歌に変えるよ。放課後の小さなスタジオ。スパルステップ、汗が落ちる。失敗して膝をついてでも笑って'],
    [76.78, 86.979, '立ち上がる。Oh yeah。ママがくれたキラキラの安物だけど大事なピアス。似合うよって信じてくれたその言葉がお守り。夜空に浮かぶビル'],
    [86.98, 97.32, 'の窓。一つ一つに夢がある。私の窓もいつかきっと色とりどり照ら'],
    [97.32, 107.8, 'したい。STARDOM POP IDOL。スポットライト浴びる日まで。転んでもね'],
    [107.8, 118.36, '、笑えばいい。涙ごとダンスしよう。Hey Hey Hey。STARDOM POP IDOL。ハートビートが合図'],
    [118.36, 141.359, 'になる。まだ届かない歓声も胸の中で響いてるから。静'],
    [141.36, 151.38, 'かになったフロア。聞こえるのは息だけ。一つ深呼吸して目を閉'],
    [151.38, 176.88, 'じて願い事。STARDOM'],
    [176.88, 187.12, 'POP IDOL。このステージで光になれ。手を伸ばしてジャンプして星をつかみに'],
    [187.12, 197.84, '行こう。Wow Wow Wow。STARDOM POP IDOL。名前呼ぶ声、風になる。今日の奇跡、明'],
    [197.84, 207.94, '日の夢、全部全部歌い尽くすよ。STARDOM POP IDOL。声枯れるまで笑い'],
    [207.94, 217.95, 'たい。指さしてね。ここにいる。あなたのためのヒロイン。Hey Hey Hey。STARDOM POP'],
    [217.95, 233.08, 'IDOL。最後の一秒まで行くよ。降り注ぐ紙吹雪の中。まだ終わらない。まだ踊れるよ。Wow oh。Wow'],
    [233.08, 243.44, 'wow wow。Wow wow wow。Wow wow wow。Wow'],
    [243.44, 250.69, 'wow wow。Wow wow wow。Wow wow wow。Hey。'],
  ]),
  'demo-ocean-morning': createTranscribedLyrics('Ocean Morning (Japanese Ver.)', 'tideblue', [
    [12.9, 23.2, '波の音が僕を呼んでいる。入り江で踊る朝の光。一歩'],
    [23.2, 34.0, 'ごとに輝きを感じて、やっと自由になれた気がするんだ。昨日の'],
    [34.0, 44.1, 'ことはもう遠い過去。必要なものは今ここにあるから。Ocean morning、ま'],
    [44.1, 54.4, 'た輝いて、胸の中の夜を洗い流して。空の色が'],
    [54.4, 64.4, '変わるたびに、僕の鼓動も高鳴り始める。Ocean morning、連'],
    [64.4, 74.7, 'れて行って。悩みなんて風に預けて。光の中で'],
    [74.7, 85.0, '生まれ変わる。すべての夢が叶う場所へ。頭の上'],
    [85.0, 95.3, 'でカモメが歌う。言えなかったあの言葉たちも、潮風の中'],
    [95.3, 105.8, '、こだまになって、海の彼方へと消えてゆく。魂に'],
    [105.8, 116.0, '響くリズムを感じて、このまま満ち引きに身を任せよう。Ocean morning、また輝'],
    [116.0, 126.0, 'いて、胸の中の夜を洗い流して。空の色が変わる'],
    [126.0, 136.2, 'たびに、僕の鼓動も高鳴り始める。輝'],
    [136.2, 146.3, 'く明日が待っている。涙はもう流さない。太'],
    [146.3, 157.4, '陽の光を抱きしめて、新しい一日を歩いてゆこう。Ocean'],
    [157.4, 167.6, 'morning、また輝いて、光を僕に降り注いで。踏み'],
    [167.6, 177.6, '出す一歩、すべての動き、今は自分で選べる気がするんだ。'],
  ]),
};

export const getSongArtist = (song: Song) => (
  typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || 'Echora'
);
