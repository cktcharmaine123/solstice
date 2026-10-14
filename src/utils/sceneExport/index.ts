import { createLocalFrame, createTerrainSampler, DETAILED_TERRAIN_ZOOM, preloadTerrainBox } from "../heatmap3d";
import { ExportDataError, fileBlob, type ExportFormat } from "../vectorExport";
import { fetchMapTiles, type MapTile } from "../vectorExport/mapData";
import { buildSceneDxf } from "./dxf";
import { buildSceneObj, MTL_FILE, OBJ_FILE } from "./obj";
import { buildScene3D, SCENE_HALF_EXTENT_M, TERRAIN_MARGIN_M, type Scene3DInput } from "./scene";
import { buildSceneSvg } from "./svg";
import { zipFiles } from "./zip";

export type { Scene3DInput };

async function loadTerrain(origin: Scene3DInput["origin"]): Promise<boolean> {
  const frame = createLocalFrame(origin.lng, origin.lat);
  const h = SCENE_HALF_EXTENT_M + TERRAIN_MARGIN_M;
  const [w, s] = frame.toLngLat(-h, -h);
  const [e, n] = frame.toLngLat(h, h);
  try {
    return await preloadTerrainBox(w, s, e, n, DETAILED_TERRAIN_ZOOM);
  } catch {
    return false;
  }
}

/**
 * Builds the 3D export. Missing map or ground data raises an ExportDataError unless skipMissing is set,
 * in which case the export goes ahead without it.
 */
export async function exportScene3D(input: Scene3DInput, format: ExportFormat, skipMissing: boolean): Promise<Blob> {
  const [tiles, terrainOk] = await Promise.all([
    fetchMapTiles({ center: input.origin, halfExtentM: SCENE_HALF_EXTENT_M + TERRAIN_MARGIN_M }).catch((err): MapTile[] | null => {
      console.warn("Map data for 3D export failed:", err);
      return null;
    }),
    loadTerrain(input.origin),
  ]);
  if (!skipMissing && !tiles) throw new ExportDataError("export3d.mapFailed", "export3d.withoutMap");
  if (!skipMissing && !terrainOk) throw new ExportDataError("export3d.terrainFailed", "export3d.flatGround");

  const scene = buildScene3D(input, tiles ?? [], terrainOk ? createTerrainSampler(DETAILED_TERRAIN_ZOOM) : null);
  if (format === "obj") {
    const { obj, mtl } = buildSceneObj(scene);
    return zipFiles([
      { name: OBJ_FILE, content: obj },
      { name: MTL_FILE, content: mtl },
    ]);
  }
  return fileBlob(format === "svg" ? buildSceneSvg(scene) : buildSceneDxf(scene), format);
}
