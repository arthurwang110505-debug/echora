import type { LyricData, Line } from '@echora/core';

function createLine(startTime: number, endTime: number, fullText: string, wordsArray: string[]): Line {
  const totalDuration = endTime - startTime;
  const wordDuration = totalDuration / wordsArray.length;
  const words = wordsArray.map((text, i) => ({
    text,
    startTime: startTime + i * wordDuration,
    endTime: startTime + (i + 1) * wordDuration,
  }));

  return {
    fullText,
    startTime,
    endTime,
    words,
  };
}

export const DEMO_LYRICS: Record<string, LyricData> = {
  sp_1: {
    title: 'Starboy',
    artist: 'The Weeknd, Daft Punk',
    isWordByWord: true,
    lines: [
      createLine(0, 4200, "I'm tryna put you in the worst mood, ah", ["I'm", "tryna", "put", "you", "in", "the", "worst", "mood,", "ah"]),
      createLine(4500, 8500, "P1 cleaner than your church shoes, ah", ["P1", "cleaner", "than", "your", "church", "shoes,", "ah"]),
      createLine(9000, 13000, "Milli point two just to hurt you, ah", ["Milli", "point", "two", "just", "to", "hurt", "you,", "ah"]),
      createLine(13500, 17800, "All red Lamb' just to tease you, ah", ["All", "red", "Lamb'", "just", "to", "tease", "you,", "ah"]),
      createLine(18200, 22500, "None of these toys on lease too, ah", ["None", "of", "these", "toys", "on", "lease", "too,", "ah"]),
      createLine(23000, 27500, "Made your whole year in a week too, yah", ["Made", "your", "whole", "year", "in", "a", "week", "too,", "yah"]),
      createLine(28000, 32000, "Main bitch out your league too, ah", ["Main", "bitch", "out", "your", "league", "too,", "ah"]),
      createLine(32500, 37000, "Side bitch out of your league too, ah", ["Side", "bitch", "out", "of", "your", "league", "too,", "ah"]),
      createLine(37500, 42000, "Look what you've done", ["Look", "what", "you've", "done"]),
      createLine(42500, 48000, "I'm a motherfuckin' starboy", ["I'm", "a", "motherfuckin'", "starboy"]),
      createLine(48500, 53000, "Look what you've done", ["Look", "what", "you've", "done"]),
      createLine(53500, 60000, "I'm a motherfuckin' starboy", ["I'm", "a", "motherfuckin'", "starboy"]),
    ],
  },
  sp_2: {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    isWordByWord: true,
    lines: [
      createLine(0, 4800, "Yeah", ["Yeah"]),
      createLine(5200, 12000, "I've been on my own for long enough", ["I've", "been", "on", "my", "own", "for", "long", "enough"]),
      createLine(12500, 19500, "Maybe you can show me how to love, maybe", ["Maybe", "you", "can", "show", "me", "how", "to", "love,", "maybe"]),
      createLine(20000, 27000, "I'm going through withdrawals", ["I'm", "going", "through", "withdrawals"]),
      createLine(27500, 34000, "You don't even have to do too much", ["You", "don't", "even", "have", "to", "do", "too", "much"]),
      createLine(34500, 41000, "You can turn me on with just a touch, baby", ["You", "can", "turn", "me", "on", "with", "just", "a", "touch,", "baby"]),
      createLine(41500, 48000, "I look around and Sin City's cold and empty", ["I", "look", "around", "and", "Sin", "City's", "cold", "and", "empty"]),
      createLine(48500, 54500, "No one's around to judge me", ["No", "one's", "around", "to", "judge", "me"]),
      createLine(55000, 62000, "I can't see clearly when you're gone", ["I", "can't", "see", "clearly", "when", "you're", "gone"]),
      createLine(62500, 70000, "I said, ooh, I'm blinded by the lights", ["I", "said,", "ooh,", "I'm", "blinded", "by", "the", "lights"]),
    ],
  },
  yt_1: {
    title: '夜に駆ける',
    artist: 'YOASOBI',
    isWordByWord: true,
    lines: [
      createLine(0, 5000, "沈むように溶けてゆくように", ["沈むように", "溶けてゆく", "ように"]),
      createLine(5500, 11000, "二人だけの空が広がる夜に", ["二人だけの", "空が広がる", "夜に"]),
      createLine(11500, 17000, "「さよなら」だけだった", ["「さよなら」", "だけ", "だった"]),
      createLine(17500, 23000, "その一言で全てが分かった", ["その一言で", "全てが", "分かった"]),
      createLine(23500, 29000, "日が沈み出した空と君の姿", ["日が沈み出した", "空と", "君の姿"]),
      createLine(29500, 36000, "フェンス越しに重なっていた", ["フェンス越しに", "重なって", "いた"]),
      createLine(36500, 43000, "初めて見た日から僕の心の全てを奪った", ["初めて見た日から", "僕の心の", "全てを奪った"]),
      createLine(43500, 50000, "どこか儚い空気を纏う君は", ["どこか儚い", "空気を纏う", "君は"]),
      createLine(50500, 58000, "寂しい目をしてたんだ", ["寂しい目を", "してたんだ"]),
    ],
  },
  yt_2: {
    title: 'First Love',
    artist: 'Utada Hikaru',
    isWordByWord: true,
    lines: [
      createLine(0, 7000, "最後のキスは タバコの flavor がした", ["最後のキスは", "タバコの", "flavor がした"]),
      createLine(7500, 15000, "苦くて切ない香り", ["苦くて", "切ない香り"]),
      createLine(15500, 24000, "明日の今頃には あなたはどこにいるんだろう", ["明日の今頃には", "あなたは", "どこにいるんだろう"]),
      createLine(24500, 32000, "誰を想ってるんだろう", ["誰を", "想ってるんだろう"]),
      createLine(32500, 40000, "You are always gonna be my love", ["You", "are", "always", "gonna", "be", "my", "love"]),
      createLine(40500, 50000, "いつか誰かとまた恋に落ちても", ["いつか誰かと", "また恋に", "落ちても"]),
      createLine(50500, 60000, "I'll remember to love you taught me how", ["I'll", "remember", "to", "love", "you", "taught", "me", "how"]),
    ],
  },
  sp_3: {
    title: 'Die With A Smile',
    artist: 'Lady Gaga, Bruno Mars',
    isWordByWord: true,
    lines: [
      createLine(0, 6000, "I, I just woke up from a dream", ["I,", "I", "just", "woke", "up", "from", "a", "dream"]),
      createLine(6500, 13000, "Where you and I had to say goodbye", ["Where", "you", "and", "I", "had", "to", "say", "goodbye"]),
      createLine(13500, 20000, "And I don't know what it all means", ["And", "I", "don't", "know", "what", "it", "all", "means"]),
      createLine(20500, 28000, "But since I survived, I realized", ["But", "since", "I", "survived,", "I", "realized"]),
      createLine(28500, 35000, "If the world was ending, I'd wanna be next to you", ["If", "the", "world", "was", "ending,", "I'd", "wanna", "be", "next", "to", "you"]),
      createLine(35500, 44000, "If the party was over and our time on Earth was through", ["If", "the", "party", "was", "over", "and", "our", "time", "on", "Earth", "was", "through"]),
      createLine(44500, 53000, "I'd wanna hold you just for a while and die with a smile", ["I'd", "wanna", "hold", "you", "just", "for", "a", "while", "and", "die", "with", "a", "smile"]),
    ],
  },
  yt_3: {
    title: 'アイドル',
    artist: 'YOASOBI',
    isWordByWord: true,
    lines: [
      createLine(0, 4000, "無敵の笑顔で荒らすメディア", ["無敵の笑顔で", "荒らす", "メディア"]),
      createLine(4500, 8000, "知りたいその秘密ミステリアス", ["知りたい", "その秘密", "ミステリアス"]),
      createLine(8500, 12000, "抜けてるとこさえ彼女のエリア", ["抜けてるとこさえ", "彼女の", "エリア"]),
      createLine(12500, 17000, "完璧で嘘つきな君は", ["完璧で", "嘘つきな", "君は"]),
      createLine(17500, 23000, "天才的なアイドル様", ["天才的な", "アイドル様"]),
      createLine(23500, 30000, "誰もが目を奪われていく", ["誰もが", "目を奪われていく"]),
      createLine(30500, 38000, "君は完璧で究極のアイドル", ["君は完璧で", "究極の", "アイドル"]),
    ],
  },
};
