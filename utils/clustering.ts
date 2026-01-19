
export interface TabItem {
  id: string; // Composite ID: groupId-tabIndex
  title: string;
  url: string;
  originalGroupIndex: number; // To track back to storage
  originalTabIndex: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'but', 'in', 'on', 'at', 'to', 'from', 'by', 'of', 'or', 'as', 'an', 'a',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'it', 'its', 'he', 'she', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'with', 'without', 'within', 'about', 'above', 'below', 'under', 'over', 'between', 'among',
  'through', 'during', 'before', 'after', 'since', 'until', 'while',
  'not', 'no', 'nor', 'neither', 'either',
  'youtube', 'github', 'google', 'com', 'org', 'net', 'www', 'http', 'https', // Common domain words
  'video', 'watch', 'page', 'home', 'index', 'view' // Common web words
]);

// Tokenize text into words
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ') // Keep alphanumeric and CJK
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// Generate vocabulary from all documents
function buildVocabulary(docs: string[][]): Map<string, number> {
  const vocab = new Map<string, number>();
  let index = 0;
  for (const doc of docs) {
    for (const word of doc) {
      if (!vocab.has(word)) {
        vocab.set(word, index++);
      }
    }
  }
  return vocab;
}

// Calculate TF-IDF vectors
function computeTFMMatrix(docs: string[][], vocab: Map<string, number>): number[][] {
  const numDocs = docs.length;
  const numTerms = vocab.size;
  const vectors: number[][] = Array(numDocs).fill(0).map(() => Array(numTerms).fill(0));
  
  // Compute IDF
  const docFreq = new Array(numTerms).fill(0);
  for (const doc of docs) {
    const uniqueWords = new Set(doc);
    for (const word of uniqueWords) {
      if (vocab.has(word)) {
        docFreq[vocab.get(word)!]++;
      }
    }
  }
  
  const idf = docFreq.map(df => Math.log((numDocs + 1) / (df + 1)) + 1); // Smoothing
  
  // Compute TF * IDF
  for (let i = 0; i < numDocs; i++) {
    const doc = docs[i];
    const termCounts = new Map<string, number>();
    for (const word of doc) {
      termCounts.set(word, (termCounts.get(word) || 0) + 1);
    }
    
    for (const [word, count] of termCounts) {
      if (vocab.has(word)) {
        const termIndex = vocab.get(word)!;
        const tf = count / doc.length;
        vectors[i][termIndex] = tf * idf[termIndex];
      }
    }
    
    // Normalize vector (L2 norm)
    const norm = Math.sqrt(vectors[i].reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      vectors[i] = vectors[i].map(val => val / norm);
    }
  }
  
  return vectors;
}

// Cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct; // Already normalized
}

// Find top keyword for a cluster from its centroid
function getClusterName(
  clusterIndices: number[], 
  vectors: number[][], 
  vocab: Map<string, number>,
  docs: string[][]
): string {
  if (clusterIndices.length === 0) return 'Misc';
  
  // Calculate centroid
  const numTerms = vectors[0].length;
  const centroid = new Array(numTerms).fill(0);
  
  for (const idx of clusterIndices) {
    const vec = vectors[idx];
    for (let i = 0; i < numTerms; i++) {
      centroid[i] += vec[i];
    }
  }
  
  // Find term with highest score in centroid
  let maxScore = -1;
  let bestTermIndex = -1;
  
  for (let i = 0; i < numTerms; i++) {
    if (centroid[i] > maxScore) {
      maxScore = centroid[i];
      bestTermIndex = i;
    }
  }
  
  if (bestTermIndex !== -1) {
    // Reverse lookup vocabulary
    for (const [word, index] of vocab.entries()) {
      if (index === bestTermIndex) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
    }
  }
  
  // Fallback: Use most common word in the first doc of cluster
  return 'Group ' + (Math.random().toString(36).substring(7));
}

// Simple GREEDY CLUSTERING (Threshold-based)
export function clusterTabs(tabs: TabItem[], threshold: number = 0.25): Map<string, TabItem[]> {
  if (tabs.length === 0) return new Map();
  if (tabs.length === 1) return new Map([['Uncategorized', tabs]]);

  const docs = tabs.map(t => tokenize(t.title));
  
  // Filter out empty docs (tabs with no meaningful words)
  // But we need to keep indices aligned, so we'll just handle empty vectors later
  
  const vocab = buildVocabulary(docs);
  if (vocab.size === 0) {
     return new Map([['Misc', tabs]]);
  }

  const vectors = computeTFMMatrix(docs, vocab);
  const assigned = new Set<number>();
  const clusters = new Map<string, TabItem[]>();
  
  // Iterate through tabs
  for (let i = 0; i < tabs.length; i++) {
    if (assigned.has(i)) continue;
    
    // Start a new cluster with this tab
    const clusterIndices = [i];
    assigned.add(i);
    
    const isVectorEmpty = vectors[i].every(v => v === 0);
    if (!isVectorEmpty) {
        // Find all other similar tabs
        for (let j = i + 1; j < tabs.length; j++) {
            if (assigned.has(j)) continue;
            
            const sim = cosineSimilarity(vectors[i], vectors[j]);
            if (sim >= threshold) {
                clusterIndices.push(j);
                assigned.add(j);
            }
        }
    }

    if (clusterIndices.length > 0) {
        let name = getClusterName(clusterIndices, vectors, vocab, docs);
        
        if (clusters.has(name)) {
            name = name + ' (2)';
        }
        
        clusters.set(name, clusterIndices.map(idx => tabs[idx]));
    }
  }
  
  // Post-processing: Group single-item clusters into "Other"
  const finalClusters = new Map<string, TabItem[]>();
  const miscItems: TabItem[] = [];
  
  for (const [name, items] of clusters) {
      if (items.length === 1) {
          miscItems.push(items[0]);
      } else {
          finalClusters.set(name, items);
      }
  }
  
  if (miscItems.length > 0) {
      finalClusters.set('Other', miscItems);
  }
  
  // Sort by size
  return new Map([...finalClusters.entries()].sort((a, b) => b[1].length - a[1].length));
}
