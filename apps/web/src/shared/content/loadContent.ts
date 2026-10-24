export type ContentSummary = {
  puzzles: number;
  vulnerabilities: number;
};

type Collection = { items: unknown[] };

function isCollection(value: unknown): value is Collection {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as Collection).items);
}

async function loadCollection(path: string): Promise<Collection> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Unable to load content: ${path}`);
  }

  const data: unknown = await response.json();

  if (!isCollection(data)) {
    throw new Error(`Invalid content collection: ${path}`);
  }

  return data;
}

export async function loadContentSummary(): Promise<ContentSummary> {
  const [vulnerabilities, puzzles] = await Promise.all([
    loadCollection('/catalog/vulnerabilities.json'),
    loadCollection('/catalog/puzzles.json'),
  ]);

  return {
    vulnerabilities: vulnerabilities.items.length,
    puzzles: puzzles.items.length,
  };
}
