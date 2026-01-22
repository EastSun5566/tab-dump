import { MiniTfIdf } from './tfidf';

export interface TabItem {
  id: string;
  title: string;
  url: string;
  groupId: number;
  tabIndex: number;
}

const DOMAIN_STOP_WORDS = [
  'com', 'org', 'net', 'io', 'dev', 'co', 'www',
  'http', 'https',
  'page', 'home', 'index', 'view', 'site'
];

function cleanTitle(title: string, url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '').split('.')[0];

    let cleaned = title.toLowerCase();
    cleaned = cleaned.replace(new RegExp(`[\\s\\-–—|]+${domain}\\s*$`, 'gi'), '');
    
    return cleaned
      .replace(/[|•·\-–—]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return title.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Hierarchical Clustering using Single-linkage
 */
function hierarchicalCluster(
  similarities: number[][],
  threshold: number
): number[][] {
  const n = similarities.length;
  const clusters: Set<number>[] = Array.from(
    { length: n },
    (_, i) => new Set([i])
  );
  
  let merged = true;
  while (merged) {
    merged = false;
    
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].size === 0) continue;
      
      for (let j = i + 1; j < clusters.length; j++) {
        if (clusters[j].size === 0) continue;
        
        // calculate max similarity between clusters (single-linkage)
        let maxSim = 0;
        for (const a of clusters[i]) {
          for (const b of clusters[j]) {
            maxSim = Math.max(maxSim, similarities[a][b]);
          }
        }
        
        // combine clusters if similarity exceeds threshold
        if (maxSim >= threshold) {
          for (const idx of clusters[j]) {
            clusters[i].add(idx);
          }
          clusters[j].clear();
          merged = true;
        }
      }
    }
  }
  
  return clusters
    .filter(c => c.size > 0)
    .map(c => Array.from(c).sort((a, b) => a - b));
}

function nameCluster(
  clusterIndices: number[],
  tabs: TabItem[],
  tfidf: MiniTfIdf
): string {
  if (clusterIndices.length === 0) return 'Empty';
  
  // Collect top terms from all tabs in the cluster
  const termScores = new Map<string, number>();
  for (const idx of clusterIndices) {
    const tabId = tabs[idx].id;
    const topTerms = tfidf.topTerms(tabId, 5);
    
    for (const [term, score] of topTerms) {
      termScores.set(term, (termScores.get(term) || 0) + score);
    }
  }
  
  // Find the term with the highest total score
  if (termScores.size === 0) return 'Misc';
  
  const sorted = Array.from(termScores.entries())
    .sort((a, b) => b[1] - a[1]);
  
  const bestTerm = sorted[0][0];
  return capitalize(bestTerm);
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function clusterTabs(
  tabs: TabItem[],
  options: {
    threshold?: number;
    minClusterSize?: number;
  } = {}
): Map<string, TabItem[]> {
  const {
    threshold = 0.25,
    minClusterSize = 2
  } = options;
  
  if (tabs.length === 0) return new Map();
  if (tabs.length === 1) return new Map([['Other', tabs]]);

  // 1. Prepare documents
  const docs: Record<string, string> = {};
  for (const tab of tabs) {
    docs[tab.id] = cleanTitle(tab.title, tab.url);
  }

  // 2. Build TF-IDF model
  const tfidf = new MiniTfIdf(docs, DOMAIN_STOP_WORDS);

  // 3. Calculate similarity matrix
  const ids = tabs.map(t => t.id);
  const n = ids.length;
  const similarities: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    similarities[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = tfidf.similarity(ids[i], ids[j]);
      similarities[i][j] = sim;
      similarities[j][i] = sim;
    }
  }

  // 4. Hierarchical clustering
  const clusterIndices = hierarchicalCluster(similarities, threshold);
  
  // 5. Name each cluster and collect results
  const result = new Map<string, TabItem[]>();
  const singletons: TabItem[] = [];

  for (const indices of clusterIndices) {
    if (indices.length < minClusterSize) {
      // Clusters that are too small go to "Other"
      for (const idx of indices) {
        singletons.push(tabs[idx]);
      }
      continue;
    }

    const clusterTabs = indices.map(idx => tabs[idx]);
    const name = nameCluster(indices, tabs, tfidf);
    
    // Handle naming conflicts
    let finalName = name;
    let counter = 2;
    while (result.has(finalName)) {
      finalName = `${name} (${counter++})`;
    }
    
    result.set(finalName, clusterTabs);
  }

  // 6. Handle single tabs
  if (singletons.length > 0) {
    result.set('Other', singletons);
  }

  // 7. Sort by size
  return new Map(
    [...result.entries()].sort((a, b) => b[1].length - a[1].length)
  );
}
