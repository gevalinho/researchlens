import { ResearchPaper } from './core-api.models';

export interface ResearchTopic {
  term: string;
  /** Number of distinct retrieved papers mentioning this topic. */
  count: number;
  /** Bar width as a percentage of the largest topic (0–100). */
  widthPercent: number;
  /** Indexes into the input paper array for papers mentioning this topic. */
  paperIndexes: number[];
}

export interface ResearchTopicDistribution {
  topics: ResearchTopic[];
  /** Papers passed in (retrieved in the current search). */
  totalRetrieved: number;
  /** Papers with a usable title or abstract that were analyzed. */
  analyzedCount: number;
  /** Papers skipped because both title and abstract were missing or blank. */
  skippedCount: number;
  /** Largest per-topic paper count, or 0 when there are no topics. */
  maxCount: number;
}

/** Maximum number of topics kept in the distribution, sorted by frequency. */
export const MAX_TOPICS = 12;

/**
 * Generic words that carry little meaning on their own ("high", "novel",
 * "service", ...) but can form valid technical terminology inside a phrase
 * ("high voltage", "web service"). They are excluded as standalone topics
 * while remaining usable inside informative two-word phrases. A phrase made
 * of two generic words (for example "novel solution") is still excluded.
 */
const GENERIC_SINGLETONS: ReadonlySet<string> = new Set([
  'high',
  'low',
  'multi',
  'new',
  'novel',
  'service',
  'services',
  'solution',
  'solutions',
]);

/**
 * Words ignored during topic extraction. Combines common English stopwords
 * with generic academic filler ("paper", "study", "results", ...) that would
 * otherwise dominate every search result without saying anything meaningful.
 */
const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a,about,above,after,again,against,aim,aims,all,almost,also,always,am,among,an,and,any,approach,approaches,are,as,at,article,articles,author,authors,background,base,based,be,because,been,before,being,below,between,both,but,by,can,cannot,could,conclusion,conclusions,data,describe,described,describes,demonstrate,demonstrates,did,discuss,discussed,discusses,do,does,doing,down,during,each,either,etc,even,ever,every,examine,examined,examines,explore,explored,explores,few,finding,findings,for,from,further,get,had,has,have,having,he,her,here,hers,herself,him,himself,his,how,however,i,if,in,include,includes,including,into,investigate,investigated,investigates,is,it,its,itself,journal,just,like,many,may,me,method,methodology,methods,more,most,much,must,my,myself,neither,never,no,nor,not,now,objective,objectives,of,off,often,on,once,only,or,other,ought,our,ours,ourselves,out,over,own,paper,papers,per,present,presents,propose,proposed,proposes,provide,provides,purpose,related,report,reports,research,researcher,researchers,result,results,review,reviews,same,several,shall,she,should,show,shown,shows,since,so,some,still,studies,study,such,survey,surveys,than,that,the,their,theirs,them,themselves,then,there,these,they,this,those,through,to,too,under,until,up,upon,us,use,used,uses,using,very,via,was,we,were,what,when,where,whether,which,while,who,whom,whose,why,will,with,within,without,work,works,would,yet,you,your,yours,yourself,yourselves'
  ).split(','),
);

/**
 * Splits free text into normalized candidate word tokens: lowercased,
 * punctuation stripped, keeping tokens with at least two characters and at
 * least one letter. Pure numbers and single characters are dropped.
 */
function tokenize(text: string): string[] {
  const candidates = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return candidates.filter(
    (token) => token.length >= 2 && /[\p{L}]/u.test(token) && !STOPWORDS.has(token),
  );
}

function tokensOfField(value: unknown): string[] {
  return typeof value === 'string' && value.trim() ? tokenize(value) : [];
}

/**
 * Extracts the distinct one- and two-word topics mentioned in a single
 * paper. Each topic appears at most once per paper so that a word repeated
 * many times in one abstract cannot outweigh a word spread across papers.
 * Two-word topics come from adjacent tokens within the same field (title or
 * abstract) and are kept only when neither word is a stopword. Generic
 * singletons are excluded as standalone topics but kept inside phrases that
 * pair them with an informative word, so valid technical terminology is
 * preserved while vague one-word topics are removed.
 */
export function extractCandidateTopics(
  title: unknown,
  abstract: unknown,
): string[] {
  const found = new Set<string>();

  for (const field of [tokensOfField(title), tokensOfField(abstract)]) {
    for (const token of field) {
      if (!GENERIC_SINGLETONS.has(token)) {
        found.add(token);
      }
    }
    for (let i = 0; i + 1 < field.length; i += 1) {
      const first = field[i];
      const second = field[i + 1];
      if (GENERIC_SINGLETONS.has(first) && GENERIC_SINGLETONS.has(second)) {
        continue;
      }
      found.add(`${first} ${second}`);
    }
  }

  return [...found].sort();
}

type TopicPaper = Pick<ResearchPaper, 'title' | 'abstract'>;

/**
 * Builds a deterministic topic-frequency distribution over the retrieved
 * papers. Every topic counts distinct papers, never repeated word
 * occurrences. Topics sort by paper count (descending), then informative
 * two-word phrases before single words, then alphabetically, so identical
 * input always yields identical output.
 */
export function buildResearchTopicDistribution(
  papers: readonly TopicPaper[],
  limit: number = MAX_TOPICS,
): ResearchTopicDistribution {
  const counts = new Map<string, number[]>();
  let analyzedCount = 0;

  papers.forEach((paper, index) => {
    const hasText =
      (typeof paper?.title === 'string' && paper.title.trim() !== '') ||
      (typeof paper?.abstract === 'string' && paper.abstract.trim() !== '');
    if (!hasText) {
      return;
    }
    analyzedCount += 1;

    for (const term of extractCandidateTopics(paper.title, paper.abstract)) {
      const indexes = counts.get(term);
      if (indexes) {
        indexes.push(index);
      } else {
        counts.set(term, [index]);
      }
    }
  });

  const effectiveLimit =
    Number.isSafeInteger(limit) && limit > 0 ? limit : MAX_TOPICS;
  const sortedTerms = [...counts.keys()].sort((a, b) => {
    const countDifference = (counts.get(b)?.length ?? 0) - (counts.get(a)?.length ?? 0);
    if (countDifference !== 0) {
      return countDifference;
    }
    const phraseDifference =
      (b.includes(' ') ? 1 : 0) - (a.includes(' ') ? 1 : 0);
    if (phraseDifference !== 0) {
      return phraseDifference;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const maxCount = sortedTerms.reduce(
    (max, term) => Math.max(max, counts.get(term)?.length ?? 0),
    0,
  );

  const topics: ResearchTopic[] = sortedTerms.slice(0, effectiveLimit).map((term) => {
    const paperIndexes = counts.get(term) ?? [];
    return {
      term,
      count: paperIndexes.length,
      widthPercent: maxCount === 0 ? 0 : Math.round((paperIndexes.length / maxCount) * 1000) / 10,
      paperIndexes: [...paperIndexes].sort((a, b) => a - b),
    };
  });

  return {
    topics,
    totalRetrieved: papers.length,
    analyzedCount,
    skippedCount: papers.length - analyzedCount,
    maxCount,
  };
}
