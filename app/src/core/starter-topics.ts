import type { ScoredPassage } from './types';

export interface StarterTopic {
  readonly id: string;
  readonly query: string;
  readonly answerText: string;
  readonly passages: ScoredPassage[];
}

// TODO: Use proper chunks later

export const STARTER_TOPICS: StarterTopic[] = [
  {
    id: 'peace',
    query: 'Peace in anxiety',
    answerText:
      "Scripture teaches that peace is not merely the absence of trouble, but the presence of God's guardianship over our hearts. Jesus gives His own peace as an enduring anchor (John 14:27), urging us to entrust our daily needs to the Father rather than carrying the burden of worry (Matthew 6:25–27). Through thankful prayer, the peace of God surpasses human comprehension and actively guards our thoughts (Philippians 4:6–7).",
    passages: [
      {
        chunk: {
          id: 1001,
          book: 'PHP',
          start: [4, 6],
          end: [4, 7],
          text: 'Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.',
        },
        score: 0.98,
        source: 'semantic',
      },
      {
        chunk: {
          id: 1002,
          book: 'JHN',
          start: [14, 27],
          end: [14, 27],
          text: 'Peace I leave with you; My peace I give to you. I do not give to you as the world gives. Do not let your hearts be troubled; do not be afraid.',
        },
        score: 0.95,
        source: 'semantic',
      },
      {
        chunk: {
          id: 1003,
          book: 'MAT',
          start: [6, 25],
          end: [6, 27],
          text: 'Therefore I tell you, do not worry about your life, what you will eat or drink; or about your body, what you will wear. Is not life more than food, and the body more than clothes? Look at the birds of the air: They do not sow or reap or gather into barns—and yet your heavenly Father feeds them. Are you not much more valuable than they? Who of you by worrying can add a single hour to his lifespan?',
        },
        score: 0.92,
        source: 'semantic',
      },
    ],
  },
  {
    id: 'strength',
    query: 'Strength and courage',
    answerText:
      "Biblical courage is rooted not in self-reliance, but in God's continuous presence. God commands Joshua to be strong and fearless because the Lord is with him wherever he goes (Joshua 1:9). When human energy fails, those who wait upon the Lord find their strength renewed to run and not grow weary (Isaiah 40:29–31), knowing God is the ultimate stronghold of life (Psalm 27:1).",
    passages: [
      {
        chunk: {
          id: 1004,
          book: 'JOS',
          start: [1, 9],
          end: [1, 9],
          text: 'Have I not commanded you? Be strong and courageous! Do not be afraid or discouraged, for the LORD your God is with you wherever you go.',
        },
        score: 0.98,
        source: 'semantic',
      },
      {
        chunk: {
          id: 1005,
          book: 'ISA',
          start: [40, 29],
          end: [40, 31],
          text: 'He gives strength to the weary and increases the power of the weak. Even youths grow tired and weary, and young men stumble and fall; but those who wait upon the LORD will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.',
        },
        score: 0.96,
        source: 'semantic',
      },
      {
        chunk: {
          id: 1006,
          book: 'PSA',
          start: [27, 1],
          end: [27, 1],
          text: 'The LORD is my light and my salvation—whom shall I fear? The LORD is the stronghold of my life—of whom shall I be afraid?',
        },
        score: 0.93,
        source: 'semantic',
      },
    ],
  },
  {
    id: 'wisdom',
    query: 'Wisdom and guidance',
    answerText:
      'True guidance begins by trusting God wholeheartedly rather than depending solely on our own understanding (Proverbs 3:5–6). Scripture acts as a direct lamp to guide our steps in daily choices (Psalm 119:105). Whenever we lack wisdom, God invites us to ask freely, promising to provide discernment generously to all who seek Him (James 1:5).',
    passages: [
      {
        chunk: {
          id: 1007,
          book: 'PRO',
          start: [3, 5],
          end: [3, 6],
          text: 'Trust in the LORD with all your heart, and lean not on your own understanding; in all your ways acknowledge Him, and He will make your paths straight.',
        },
        score: 0.98,
        source: 'semantic',
      },
      {
        chunk: {
          id: 1008,
          book: 'JAS',
          start: [1, 5],
          end: [1, 5],
          text: 'Now if any of you lacks wisdom, he should ask God, who gives generously to all without finding fault, and it will be given to him.',
        },
        score: 0.95,
        source: 'semantic',
      },
      {
        chunk: {
          id: 1009,
          book: 'PSA',
          start: [119, 105],
          end: [119, 105],
          text: 'Your word is a lamp to my feet and a light to my path.',
        },
        score: 0.92,
        source: 'semantic',
      },
    ],
  },
];

export function getRandomStarterTopic(): StarterTopic {
  const index = Math.floor(Math.random() * STARTER_TOPICS.length);
  return STARTER_TOPICS[index]!;
}

export const POPULAR_TOPICS: string[] = [
  'Peace in anxiety',
  'Strength and courage',
  'Wisdom and guidance',
  'Forgiveness and grace',
  'Comfort in grief',
  'Faith and trust',
  'Love your neighbor',
  'Hope for the future',
];

export const SEARCH_SUGGESTIONS: string[] = [
  'Philippians 4:7',
  'peace that surpasses',
  'What did Jesus teach about worry?',
  'Romans 8:28',
];


