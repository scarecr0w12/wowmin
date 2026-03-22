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
}

export const CONTINENT_BOUNDS: Record<number, MapBounds> = {
  0: {
    label: 'Eastern Kingdoms',
    locLeft: 3116.9,  locRight: -11840.0,
    locTop:  1053.3,  locBottom: -11860.9,
    bgColor: '#182318',
  },
  1: {
    label: 'Kalimdor',
    locLeft: 3.8,     locRight: -13440.0,
    locTop:  11188.0, locBottom: -3931.0,
    bgColor: '#1e1b14',
  },
  530: {
    label: 'Outland',
    locLeft: 7904.0,  locRight: -7108.0,
    locTop:  7692.0,  locBottom: -7076.0,
    bgColor: '#1c1024',
  },
  571: {
    label: 'Northrend',
    locLeft: 8129.0,  locRight: -5095.0,
    locTop:  11180.0, locBottom: -1500.0,
    bgColor: '#131c2a',
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
  const x = ((bounds.locLeft - posY) / (bounds.locLeft - bounds.locRight)) * canvasWidth;
  const y = ((bounds.locTop  - posX) / (bounds.locTop  - bounds.locBottom)) * canvasHeight;
  return {
    x: Math.max(4, Math.min(canvasWidth  - 4, x)),
    y: Math.max(4, Math.min(canvasHeight - 4, y)),
  };
}
