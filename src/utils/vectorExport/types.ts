export type LatLng = [number, number];

export type DiagramPath = {
  label: string;
  dateLabel: string;
  timeLabel: string;
  color: string;
  dashed: boolean;
  points: LatLng[];
  marker: LatLng | null;
  cone: LatLng[];
};

/** Everything needed to redraw a 2D sun-path diagram, stored with saved graphs. */
export type DiagramSpec = {
  version: 1;
  center: { lat: number; lng: number };
  halfExtentM: number;
  title: string;
  paths: DiagramPath[];
};

export type Pt = [number, number];
export type Ring = Pt[];
export type PolygonRings = Ring[];

export type RoadClass = "major" | "minor" | "path";

export type StreetLabel = { text: string; x: number; y: number; angleDeg: number };

/** Map features in metres east (x) and north (y) of the diagram centre, clipped to the diagram square. */
export type MapOutlines = {
  parks: PolygonRings[];
  water: PolygonRings[];
  waterways: Pt[][];
  buildings: PolygonRings[];
  roads: { cls: RoadClass; widthM: number; line: Pt[] }[];
  railways: Pt[][];
  labels: StreetLabel[];
};

export type ExportFormat = "svg" | "dxf" | "obj";
