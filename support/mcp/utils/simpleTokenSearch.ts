import type { Data, SearchResult } from './types';

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/iu)
    .filter((token) => token.length > 2);

export const simpleTokenSearch = (data: Data, pattern: string): SearchResult[] => {
  const patternTokens = tokenize(pattern);

  const scored: Array<SearchResult & { precision: number }> = [];

  data.files.forEach((file) => {
    file.steps.forEach((step) => {
      try {
        const regex = new RegExp(step.pattern, 'i');
        if (regex.test(pattern)) {
          scored.push({
            pattern: step.pattern,
            description: step.description,
            file: file.fileName,
            line: step.line,
            score: 1,
            matchedTokens: ['exact match'],
            precision: 1,
          });
          return;
        }
      } catch {
        // ignore invalid regex patterns
      }

      if (patternTokens.length === 0) {
        return;
      }

      const stepPatternText = step.pattern.toLowerCase();
      const descriptionText = (step.description ?? '').toLowerCase();

      // Matches in the step pattern weigh more than matches found only in the description
      const patternMatches = patternTokens.filter((token) => stepPatternText.includes(token));
      const descriptionOnlyMatches = patternTokens.filter(
        (token) => !stepPatternText.includes(token) && descriptionText.includes(token),
      );

      const matchedTokens = [...patternMatches, ...descriptionOnlyMatches];
      if (matchedTokens.length === 0) {
        return;
      }

      const score = (patternMatches.length + 0.5 * descriptionOnlyMatches.length) / patternTokens.length;
      // Precision: how much of the step pattern is covered — penalizes long
      // unrelated steps that happen to share one token with the query
      const stepTokens = tokenize(step.pattern);
      const precision = stepTokens.length > 0 ? patternMatches.length / stepTokens.length : 0;

      scored.push({
        pattern: step.pattern,
        description: step.description,
        file: file.fileName,
        line: step.line,
        score,
        matchedTokens,
        precision,
      });
    });
  });

  return scored
    .sort((a, b) => b.score - a.score || b.precision - a.precision)
    .map(({ precision: _precision, ...result }) => result);
};
