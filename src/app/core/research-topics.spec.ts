import { ResearchPaper } from './core-api.models';
import {
  MAX_TOPICS,
  buildResearchTopicDistribution,
  extractCandidateTopics,
} from './research-topics';

type TopicPaper = Pick<ResearchPaper, 'title' | 'abstract'>;

function paper(title: TopicPaper['title'], abstract: TopicPaper['abstract'] = null): TopicPaper {
  return { title, abstract };
}

describe('extractCandidateTopics', () => {
  it('extracts one- and two-word topics from a title', () => {
    expect(extractCandidateTopics('Drone delivery systems', null)).toEqual([
      'delivery',
      'delivery systems',
      'drone',
      'drone delivery',
      'systems',
    ]);
  });

  it('normalizes case and strips punctuation', () => {
    expect(extractCandidateTopics('Drones, DRONES; (drones!)', null)).toEqual([
      'drones',
      'drones drones',
    ]);
  });

  it('excludes stopwords from single topics and phrases containing them', () => {
    const topics = extractCandidateTopics('The study of ocean currents', null);

    expect(topics).toContain('ocean');
    expect(topics).toContain('currents');
    expect(topics).toContain('ocean currents');
    expect(topics).not.toContain('the');
    expect(topics).not.toContain('study');
    expect(topics).not.toContain('of');
    expect(topics).not.toContain('study of');
    expect(topics).not.toContain('of ocean');
  });

  it('combines title and abstract without duplicating shared topics', () => {
    expect(extractCandidateTopics('Drone delivery', 'drone delivery routes')).toEqual([
      'delivery',
      'delivery routes',
      'drone',
      'drone delivery',
      'routes',
    ]);
  });

  it('keeps phrases within a field and never across the title/abstract boundary', () => {
    const topics = extractCandidateTopics('solar panels', 'rural clinics');

    expect(topics).toContain('solar panels');
    expect(topics).toContain('rural clinics');
    expect(topics).not.toContain('panels rural');
  });

  it('returns no topics when both fields are missing or blank', () => {
    expect(extractCandidateTopics(null, null)).toEqual([]);
    expect(extractCandidateTopics('   ', '  ')).toEqual([]);
    expect(extractCandidateTopics(undefined, undefined)).toEqual([]);
  });
});

describe('buildResearchTopicDistribution', () => {
  it('counts distinct papers per topic, not repeated word occurrences', () => {
    const distribution = buildResearchTopicDistribution([
      paper('Drone drone drone delivery', 'drone drone drone'),
      paper('Drone mapping survey', null),
    ]);

    const drone = distribution.topics.find((topic) => topic.term === 'drone');
    expect(drone?.count).toBe(2);
    expect(drone?.paperIndexes).toEqual([0, 1]);
    expect(distribution.maxCount).toBe(2);
  });

  it('ranks topics by paper count, phrases first, then alphabetically', () => {
    const distribution = buildResearchTopicDistribution(
      [
        paper('Zebra migration patterns', null),
        paper('Apple harvest yields', null),
        paper('Zebra apple orchards', null),
      ],
      10,
    );

    expect(distribution.topics.map((topic) => topic.term)).toEqual([
      'apple',
      'zebra',
      'apple harvest',
      'apple orchards',
      'harvest yields',
      'migration patterns',
      'zebra apple',
      'zebra migration',
      'harvest',
      'migration',
    ]);
    expect(distribution.topics[0].count).toBe(2);
    expect(distribution.topics[1].count).toBe(2);
  });

  it('keeps only the most frequent topics and scales bar widths', () => {
    const papers = [
      paper('Climate adaptation planning', null),
      paper('Climate adaptation finance', null),
      paper('Urban heat islands', null),
    ];
    const distribution = buildResearchTopicDistribution(papers, 2);

    expect(distribution.topics.map((topic) => topic.term)).toEqual([
      'climate adaptation',
      'adaptation',
    ]);
    expect(distribution.topics.map((topic) => topic.count)).toEqual([2, 2]);
    expect(distribution.topics.map((topic) => topic.widthPercent)).toEqual([100, 100]);
    expect(distribution.maxCount).toBe(2);
  });

  it('scales widths relative to the largest topic', () => {
    const distribution = buildResearchTopicDistribution(
      [
        paper('Offshore wind turbines', null),
        paper('Offshore wind farms', null),
        paper('Offshore wind policy', null),
        paper('Solar rooftops', null),
      ],
      20,
    );

    const wind = distribution.topics.find((topic) => topic.term === 'wind');
    const solar = distribution.topics.find((topic) => topic.term === 'solar');
    expect(wind?.widthPercent).toBe(100);
    expect(solar?.widthPercent).toBe(33.3);
  });

  it('handles missing metadata by skipping papers without usable text', () => {
    const distribution = buildResearchTopicDistribution([
      paper(null, null),
      paper('   ', '  '),
      paper('Tidal energy lagoons', null),
      paper(null, 'Wave energy converters'),
    ]);

    expect(distribution.totalRetrieved).toBe(4);
    expect(distribution.analyzedCount).toBe(2);
    expect(distribution.skippedCount).toBe(2);
    expect(distribution.topics.find((topic) => topic.term === 'energy')?.count).toBe(2);
  });

  it('returns an empty distribution for no papers', () => {
    expect(buildResearchTopicDistribution([])).toEqual({
      topics: [],
      totalRetrieved: 0,
      analyzedCount: 0,
      skippedCount: 0,
      maxCount: 0,
    });
  });

  it('returns no topics when every paper lacks usable text', () => {
    const distribution = buildResearchTopicDistribution([paper(null, null), paper(null, null)]);

    expect(distribution.topics).toEqual([]);
    expect(distribution.totalRetrieved).toBe(2);
    expect(distribution.analyzedCount).toBe(0);
    expect(distribution.skippedCount).toBe(2);
    expect(distribution.maxCount).toBe(0);
  });

  it('ignores papers whose text holds only stopwords', () => {
    const distribution = buildResearchTopicDistribution([
      paper('The study of research', null),
      paper('Quantum dot lasers', null),
    ]);

    expect(distribution.analyzedCount).toBe(2);
    expect(distribution.skippedCount).toBe(0);
    expect(distribution.topics.map((topic) => topic.term)).toEqual([
      'dot lasers',
      'quantum dot',
      'dot',
      'lasers',
      'quantum',
    ]);
  });

  it('is deterministic for identical input', () => {
    const papers = [
      paper('Mangrove restoration ecology', 'Coastal mangrove restoration'),
      paper('Coral reef restoration', null),
    ];

    expect(buildResearchTopicDistribution(papers)).toEqual(
      buildResearchTopicDistribution(papers),
    );
  });

  it(`caps the default topic list at ${MAX_TOPICS} entries`, () => {
    const words = [
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
      'iota', 'kappa', 'lambda', 'muon', 'nusigma', 'omicron', 'pirho',
    ];
    const distribution = buildResearchTopicDistribution([
      paper(`Shared ${words.join(' ')}`, null),
    ]);

    expect(distribution.topics.length).toBe(MAX_TOPICS);
    expect(distribution.topics[0].term).toBe('alpha beta');
    expect(distribution.topics).toEqual([...distribution.topics].sort((a, b) =>
      a.count !== b.count
        ? b.count - a.count
        : (b.term.includes(' ') ? 1 : 0) - (a.term.includes(' ') ? 1 : 0) ||
          (a.term < b.term ? -1 : 1),
    ));
  });

  it('filters generic singletons while keeping them inside informative phrases', () => {
    const topics = extractCandidateTopics('Novel multi service solution for high voltage monitoring', null);

    expect(topics).not.toContain('novel');
    expect(topics).not.toContain('multi');
    expect(topics).not.toContain('service');
    expect(topics).not.toContain('solution');
    expect(topics).not.toContain('high');
    expect(topics).toContain('voltage');
    expect(topics).toContain('monitoring');
    expect(topics).toContain('high voltage');
    expect(topics).toContain('voltage monitoring');
    expect(topics).not.toContain('novel multi');
    expect(topics).not.toContain('novel solution');
  });

  it('preserves valid technical terminology that pairs a generic word with an informative one', () => {
    const topics = extractCandidateTopics('Web service latency', null);

    expect(topics).not.toContain('service');
    expect(topics).toContain('web');
    expect(topics).toContain('latency');
    expect(topics).toContain('web service');
    expect(topics).toContain('service latency');
  });

  it('ranks an informative phrase ahead of single words with the same paper count', () => {
    const distribution = buildResearchTopicDistribution(
      [
        paper('Drone delivery systems', null),
        paper('Drone delivery routes', null),
      ],
      10,
    );

    expect(distribution.topics.slice(0, 3).map((topic) => topic.term)).toEqual([
      'drone delivery',
      'delivery',
      'drone',
    ]);
    expect(distribution.topics.slice(0, 3).map((topic) => topic.count)).toEqual([2, 2, 2]);
  });
});
