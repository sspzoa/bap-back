export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator,
      );
    }
  }

  return matrix[str2.length][str1.length];
}

export function calculateSimilarity(query: string, target: string): number {
  const normalizedQuery = normalizeText(query);
  const normalizedTarget = normalizeText(target);

  if (normalizedQuery === normalizedTarget) {
    return 1.0;
  }

  if (normalizedTarget.includes(normalizedQuery)) {
    return 0.9;
  }

  if (normalizedQuery.includes(normalizedTarget)) {
    return 0.8;
  }

  const distance = levenshteinDistance(normalizedQuery, normalizedTarget);
  const maxLength = Math.max(normalizedQuery.length, normalizedTarget.length);

  if (maxLength === 0) return 0;

  const similarity = 1 - distance / maxLength;

  if (similarity >= 0.7) {
    return similarity;
  }

  const words = normalizedQuery.split('');
  const targetWords = normalizedTarget.split('');
  let commonChars = 0;

  for (const char of words) {
    if (targetWords.includes(char)) {
      commonChars++;
    }
  }

  const charSimilarity = commonChars / Math.max(words.length, targetWords.length);

  return Math.max(similarity, charSimilarity * 0.6);
}

export function isFlexibleMatch(query: string, target: string, threshold: number = 0.6): boolean {
  return calculateSimilarity(query, target) >= threshold;
}

export function findBestMatches<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  threshold: number = 0.6,
  maxResults: number = 10
): Array<{ item: T; similarity: number }> {
  const matches = items
    .map(item => ({
      item,
      similarity: calculateSimilarity(query, getText(item))
    }))
    .filter(match => match.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);

  return matches;
}

const koreanInitials = {
  'ㄱ': ['가', '나'],
  'ㄴ': ['나', '다'],
  'ㄷ': ['다', '라'],
  'ㄹ': ['라', '마'],
  'ㅁ': ['마', '바'],
  'ㅂ': ['바', '사'],
  'ㅅ': ['사', '아'],
  'ㅇ': ['아', '자'],
  'ㅈ': ['자', '차'],
  'ㅊ': ['차', '카'],
  'ㅋ': ['카', '타'],
  'ㅌ': ['타', '파'],
  'ㅍ': ['파', '하'],
  'ㅎ': ['하', '힣']
};

export function expandKoreanInitials(text: string): string[] {
  const variations = [text];

  for (const [initial, range] of Object.entries(koreanInitials)) {
    if (text.includes(initial)) {
      const [start, end] = range;
      for (let i = start.charCodeAt(0); i <= end.charCodeAt(0); i += 28) {
        const char = String.fromCharCode(i);
        variations.push(text.replace(initial, char));
      }
    }
  }

  return variations;
}