// WoW continent coordinate bounds (from WorldMapArea.dbc, WotLK 3.3.5a)
//
// locLeft  / locRight  = in-game position_y at the left (West) / right (East) edge of the map image
// locTop   / locBottom = in-game position_x at the top (North) / bottom (South) edge of the map image
//
// Canvas pixel conversion:
//   canvas_x = (locLeft - position_y) / (locLeft - locRight)  * canvasWidth
//   canvas_y = (locTop  - position_x) / (locTop  - locBottom) * canvasHeight

export interface MapBounds {
  label: string;
  locLeft: number;    // in-game Y at left (West) edge
  locRight: number;   // in-game Y at right (East) edge
  locTop: number;     // in-game X at top (North) edge
  locBottom: number;  // in-game X at bottom (South) edge
  bgColor: string;    // canvas background colour
  tileProjection?: {
    gridSize: number;
    worldUnitsPerTile: number;
    minTileX: number;
    maxTileX: number;
    minTileY: number;
    maxTileY: number;
  };
}

const MINIMAP_TILE_GRID_SIZE = 64;
const WORLD_UNITS_PER_TILE = 533.3333333333334;

export const CONTINENT_BOUNDS: Record<number, MapBounds> = {
  0: {
    label: 'Eastern Kingdoms',
    locLeft: 3116.9,  locRight: -11840.0,
    locTop:  1053.3,  locBottom: -11860.9,
    bgColor: '#182318',
    tileProjection: {
      gridSize: MINIMAP_TILE_GRID_SIZE,
      worldUnitsPerTile: WORLD_UNITS_PER_TILE,
      minTileX: 24,
      maxTileX: 44,
      minTileY: 20,
      maxTileY: 61,
    },
  },
  1: {
    label: 'Kalimdor',
    locLeft: 3.8,     locRight: -13440.0,
    locTop:  11188.0, locBottom: -3931.0,
    bgColor: '#1e1b14',
    tileProjection: {
      gridSize: MINIMAP_TILE_GRID_SIZE,
      worldUnitsPerTile: WORLD_UNITS_PER_TILE,
      minTileX: 0,
      maxTileX: 50,
      minTileY: 0,
      maxTileY: 55,
    },
  },
  530: {
    label: 'Outland',
    locLeft: 7904.0,  locRight: -7108.0,
    locTop:  7692.0,  locBottom: -7076.0,
    bgColor: '#1c1024',
    tileProjection: {
      gridSize: MINIMAP_TILE_GRID_SIZE,
      worldUnitsPerTile: WORLD_UNITS_PER_TILE,
      minTileX: 12,
      maxTileX: 60,
      minTileY: 6,
      maxTileY: 44,
    },
  },
  571: {
    label: 'Northrend',
    locLeft: 8129.0,  locRight: -5095.0,
    locTop:  11180.0, locBottom: -1500.0,
    bgColor: '#131c2a',
    tileProjection: {
      gridSize: MINIMAP_TILE_GRID_SIZE,
      worldUnitsPerTile: WORLD_UNITS_PER_TILE,
      minTileX: 11,
      maxTileX: 49,
      minTileY: 9,
      maxTileY: 37,
    },
  },
};

/**
 * Convert world-space (position_x, position_y) to canvas pixel coordinates.
 * Result is clamped to a 4 px margin inside the canvas.
 */
export function worldToCanvas(
  posX: number,
  posY: number,
  bounds: MapBounds,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  if (bounds.tileProjection) {
    const { gridSize, worldUnitsPerTile, minTileX, maxTileX, minTileY, maxTileY } = bounds.tileProjection;
    const originTile = gridSize / 2;
    const cropWidthTiles = maxTileX - minTileX + 1;
    const cropHeightTiles = maxTileY - minTileY + 1;

    // WoW minimaps are generated on a 64×64 tile grid around the world origin.
    // Our stitched JPGs are cropped to the occupied tile rectangle, so project into
    // the full tile space first, then into the cropped image space.
    const fullTileX = originTile - (posY / worldUnitsPerTile);
    const fullTileY = originTile - (posX / worldUnitsPerTile);
    const x = ((fullTileX - minTileX) / cropWidthTiles) * canvasWidth;
    const y = ((fullTileY - minTileY) / cropHeightTiles) * canvasHeight;

    return {
      x: Math.max(4, Math.min(canvasWidth - 4, x)),
      y: Math.max(4, Math.min(canvasHeight - 4, y)),
    };
  }

  const x = ((bounds.locLeft - posY) / (bounds.locLeft - bounds.locRight)) * canvasWidth;
  const y = ((bounds.locTop  - posX) / (bounds.locTop  - bounds.locBottom)) * canvasHeight;
  return {
    x: Math.max(4, Math.min(canvasWidth  - 4, x)),
    y: Math.max(4, Math.min(canvasHeight - 4, y)),
  };
}
