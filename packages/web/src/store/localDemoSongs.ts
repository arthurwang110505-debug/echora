import type { LyricData, Song } from '@echora/core';
import { createCoverPlaceholder } from '../utils/coverPlaceholders';

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

export const LOCAL_DEMO_SONGS: LocalDemoSong[] = [
  {
    id: 'demo-dancing-in-the-stardust',
    title: 'Dancing in the Stardust',
    artists: [{ id: 'freesoundserver', name: 'Free Sound Server' }],
    album: showcaseAlbum,
    durationMs: 118440,
    coverUrl: createCoverPlaceholder('Dancing in the Stardust', 'artist'),
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
    coverUrl: createCoverPlaceholder('Blue Knot', 'artist'),
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
    coverUrl: createCoverPlaceholder('Sun Beneath a Song', 'artist'),
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
    coverUrl: createCoverPlaceholder('Stardust Pop Idol', 'artist'),
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
    coverUrl: createCoverPlaceholder('Ocean Morning', 'artist'),
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

export const LOCAL_DEMO_LYRICS: Record<string, LyricData> = {};

export const getSongArtist = (song: Song) => (
  typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || 'Echora'
);
