type DocumentVector = Map<string, number>;

const STOP_WORDS = new Set([
  "i", "a", "me", "my", "we", "you", "he", "she", "it", "they",
  "am", "is", "are", "was", "were", "be", "been", "have", "has",
  "had", "do", "does", "did", "the", "and", "but", "if", "or",
  "as", "of", "at", "by", "for", "with", "to", "from", "in",
  "out", "on", "off", "this", "that", "what", "which", "who",
  "when", "where",
]);

export class MiniTfIdf {
  private docs = new Map<string, string>();
  private stopWords: Set<string>;
  private K1 = 2.0;
  private b = 0.75;
  private cache?: Map<string, DocumentVector>;

  constructor(
    docs: Record<string, string> = {},
    stopWords: string[] = [],
  ) {
    Object.entries(docs).forEach(([id, text]) => this.docs.set(id, text));
    this.stopWords = stopWords.length > 0
      ? new Set([...STOP_WORDS, ...stopWords])
      : STOP_WORDS;
  }

  add(id: string, text: string): boolean {
    if (this.docs.has(id)) return false;
    this.docs.set(id, text);
    this.cache = undefined;
    return true;
  }

  private tokenize(text: string): string[] {
    return (text.match(/[\p{L}\p{N}]+/gu) || [])
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 1 || ["i", "a"].includes(w))
      .filter((w) => !/^\d+$/.test(w));
  }

  private termFreq(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    return freq;
  }

  private getVectors(): Map<string, DocumentVector> {
    if (this.cache) return this.cache;

    const vectors = new Map<string, DocumentVector>();
    const docTokens = new Map<string, string[]>();
    const docFreq = new Map<string, number>();

    for (const [id, text] of this.docs) {
      const tokens = this.tokenize(text).filter((t) => !this.stopWords.has(t));
      docTokens.set(id, tokens);
      
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    const N = this.docs.size;
    if (N === 0) return vectors;

    const totalTokens = Array.from(docTokens.values())
      .reduce((sum, tokens) => sum + tokens.length, 0);
    const avgDocLen = totalTokens / N;

    for (const [id, tokens] of docTokens) {
      const tf = this.termFreq(tokens);
      const vector: DocumentVector = new Map();
      const normalizedLen = tokens.length / avgDocLen;

      for (const [term, termFreq] of tf) {
        const df = docFreq.get(term) ?? 1;
        const idf = Math.log((N + 1) / df);
        const weight = (idf * termFreq * (this.K1 + 1)) /
          (this.K1 * (1 - this.b + this.b * normalizedLen) + termFreq);
        vector.set(term, weight);
      }

      vectors.set(id, vector);
    }

    this.cache = vectors;
    return vectors;
  }

  topTerms(id: string, n = 10): [string, number][] {
    const vector = this.getVectors().get(id);
    if (!vector) return [];

    return Array.from(vector.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  search(query: string, n = 10): [string, number][] {
    if (!query?.trim()) return [];

    const queryTerms = this.tokenize(query)
      .filter((t) => !this.stopWords.has(t));
    
    if (queryTerms.length === 0) return [];

    const vectors = this.getVectors();
    const scores: [string, number][] = [];

    for (const [id, vector] of vectors) {
      let score = 0;
      for (const term of queryTerms) {
        score += vector.get(term) || 0;
      }
      if (score > 0) {
        scores.push([id, score]);
      }
    }

    return scores
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  similarity(id1: string, id2: string): number {
    const vectors = this.getVectors();
    const v1 = vectors.get(id1);
    const v2 = vectors.get(id2);
    if (!v1 || !v2) return 0;

    const allTerms = new Set([...v1.keys(), ...v2.keys()]);
    let dotProduct = 0;
    let magSquared1 = 0;
    let magSquared2 = 0;

    for (const term of allTerms) {
      const w1 = v1.get(term) || 0;
      const w2 = v2.get(term) || 0;
      dotProduct += w1 * w2;
      magSquared1 += w1 * w1;
      magSquared2 += w2 * w2;
    }

    const magnitudeProduct = Math.sqrt(magSquared1 * magSquared2);
    return magnitudeProduct > 0 ? dotProduct / magnitudeProduct : 0;
  }

  ids(): string[] {
    return Array.from(this.docs.keys());
  }
}
