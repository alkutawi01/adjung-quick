// Deterministic fixture used only when live RSS is unavailable in regression
// suites. Each story has enough unique alphabetic tokens to avoid accidental
// Tier-1 clustering while still exercising every legacy classifier topic.

const TOPICS = [
  { keyword: 'kerajaan', sourceId: 'rss-astro-awani', language: 'ms' },
  { keyword: 'ekonomi', sourceId: 'rss-bbc-world', language: 'en' },
  { keyword: 'sukan', sourceId: 'rss-bbc-arabic', language: 'ar' },
  { keyword: 'dunia', sourceId: 'rss-astro-awani', language: 'ms' },
  { keyword: 'sains', sourceId: 'rss-bbc-world', language: 'en' },
  { keyword: 'kesihatan', sourceId: 'rss-bbc-arabic', language: 'ar' },
];

const uniqueWord = index => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  return `fixture${alphabet[index % alphabet.length]}${alphabet[Math.floor(index / alphabet.length)]}`;
};

export function deterministicFixtureItems() {
  const publishedAt = '2026-08-16T00:00:00.000Z';
  // 12 candidates per classifier topic: enough to fill the 10 Active Set
  // slots and still exercise RELEASE_STORY replacement assertions.
  return Array.from({ length: 72 }, (_, index) => {
    const topic = TOPICS[index % TOPICS.length];
    const word = uniqueWord(index);
    return {
      sourceId: topic.sourceId,
      sourceName: `Fixture ${topic.sourceId}`,
      language: topic.language,
      trustScore: 80 + (index % 15),
      rssGuid: `fixture-guid-${index}`,
      // Numeric-only differences are ignored by tokenization. These distinct
      // alphabetic tokens keep a fixture batch meaningfully multi-story.
      title: `${topic.keyword} ${word} alpha${word} beta${word} gamma${word}`,
      description: `Deterministic ${word} description.`,
      link: `https://fixture.invalid/story-${index}`,
      normalizedUrl: `fixture.invalid/story-${index}`,
      publishedAt,
      categories: [],
      topic: null,
    };
  });
}
