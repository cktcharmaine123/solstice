export type SavedGraph = {
  id: string;
  name: string;
  createdAt: string;
  imageData: string;
  locationLabel: string;
  dateLabel: string;
};

const STORAGE_KEY = "sun-path-saved-graphs";

export function getSavedGraphs(): SavedGraph[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedGraph[]) : [];
  } catch {
    return [];
  }
}

function writeSavedGraphs(graphs: SavedGraph[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs));
  window.dispatchEvent(new Event("saved-graphs-changed"));
}

export function saveGraph(graph: SavedGraph): void {
  writeSavedGraphs([graph, ...getSavedGraphs()]);
}

export function renameGraph(id: string, name: string): void {
  writeSavedGraphs(getSavedGraphs().map((graph) => (graph.id === id ? { ...graph, name } : graph)));
}

export function deleteGraph(id: string): void {
  writeSavedGraphs(getSavedGraphs().filter((graph) => graph.id !== id));
}

export function formatGraphName(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${date.getFullYear()}`;
}
