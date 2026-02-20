/**
 * KiCad PCB (.kicad_pcb) Parser
 *
 * Parses the S-expression based PCB file format.
 * Extracts footprints, tracks, vias, board outline, zones, graphic items.
 */

import {
  parseSExpression, findExpr, findAllExpr,
  getStringValue, getNumberValue, getXY, getSize,
  type SExpr,
} from './sexpr';

// --- Types ---

export interface PcbLayer {
  id: number;
  name: string;
  type: string;
}

export interface PcbTrack {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  layer: string;
  net: number;
}

export interface PcbVia {
  x: number;
  y: number;
  size: number;
  drill: number;
  layers: string[];
  net: number;
}

export interface PcbPad {
  number: string;
  type: string;
  shape: string;
  x: number;
  y: number;
  rotation: number;
  sizeX: number;
  sizeY: number;
  drill: number;
  layers: string[];
  net: number;
  netName: string;
  roundrectRatio: number;
}

export interface FpGraphic {
  type: 'line' | 'rect' | 'circle' | 'arc' | 'poly';
  layer: string;
  width: number;
  // line
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  // circle
  centerX?: number;
  centerY?: number;
  radius?: number;
  // arc
  arcStartX?: number;
  arcStartY?: number;
  arcMidX?: number;
  arcMidY?: number;
  arcEndX?: number;
  arcEndY?: number;
  // polygon
  points?: { x: number; y: number }[];
  fill?: string;
}

export interface FpText {
  type: string; // 'reference', 'value', 'user'
  text: string;
  x: number;
  y: number;
  rotation: number;
  layer: string;
  fontSize: number;
  visible: boolean;
}

export interface PcbFootprint {
  reference: string;
  value: string;
  libId: string;
  x: number;
  y: number;
  rotation: number;
  layer: string;
  pads: PcbPad[];
  graphics: FpGraphic[];
  texts: FpText[];
  raw: SExpr[];
}

export interface BoardLine {
  type: 'line' | 'arc' | 'rect' | 'circle' | 'poly';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  midX?: number;
  midY?: number;
  layer: string;
  width: number;
  points?: { x: number; y: number }[];
  fill?: string;
}

export interface PcbNet {
  id: number;
  name: string;
}

export interface PcbZone {
  net: number;
  netName: string;
  layer: string;
  points: { x: number; y: number }[];
}

export interface PcbData {
  version: number;
  generator: string;
  layers: PcbLayer[];
  nets: PcbNet[];
  footprints: PcbFootprint[];
  tracks: PcbTrack[];
  vias: PcbVia[];
  boardOutline: BoardLine[];
  graphicItems: BoardLine[];
  zones: PcbZone[];
  raw: SExpr[];
}

// --- Parser ---

export class KicadPcbParser {
  parse(content: string): PcbData {
    const exprs = parseSExpression(content);

    const root = exprs[0];
    if (!Array.isArray(root) || root[0] !== 'kicad_pcb') {
      throw new Error('Invalid KiCad PCB file: root must be "kicad_pcb"');
    }

    const version = getNumberValue(root, 'version') ?? 0;
    const generator = getStringValue(root, 'generator') ?? 'unknown';
    const layers = this.parseLayers(root);

    return {
      version,
      generator,
      layers: this.parseLayers(root),
      nets: this.parseNets(root),
      footprints: this.parseFootprints(root, layers),
      tracks: this.parseTracks(root),
      vias: this.parseVias(root),
      boardOutline: this.parseBoardOutline(root),
      graphicItems: this.parseGraphicItems(root),
      zones: this.parseZones(root),
      raw: root,
    };
  }

  private parseLayers(root: SExpr[]): PcbLayer[] {
    const layersExpr = findExpr(root, 'layers');
    if (!layersExpr) return [];
    const layers: PcbLayer[] = [];
    for (let i = 1; i < layersExpr.length; i++) {
      const l = layersExpr[i];
      if (Array.isArray(l) && l.length >= 3) {
        layers.push({ id: Number(l[0]), name: String(l[1]), type: String(l[2]) });
      }
    }
    return layers;
  }

  private parseNets(root: SExpr[]): PcbNet[] {
    return findAllExpr(root, 'net').map(n => ({
      id: Number(n[1]),
      name: n.length > 2 ? String(n[2]) : '',
    }));
  }

  private parseFootprints(root: SExpr[], pcbLayers: PcbLayer[]): PcbFootprint[] {
    return findAllExpr(root, 'footprint').map(fp => {
      const libId = fp.length > 1 ? String(fp[1]) : '';
      const at = getXY(fp, 'at');
      const layer = getStringValue(fp, 'layer') ?? 'F.Cu';

      // Properties (KiCad 8+)
      const properties: Record<string, string> = {};
      for (const prop of findAllExpr(fp, 'property')) {
        if (prop.length >= 3) properties[String(prop[1])] = String(prop[2]);
      }

      // fp_text (KiCad 7 and older)
      let reference = properties['Reference'] ?? '';
      let value = properties['Value'] ?? '';
      const texts: FpText[] = [];

      for (const fpText of findAllExpr(fp, 'fp_text')) {
        if (fpText.length >= 3) {
          const textType = String(fpText[1]);
          const textValue = String(fpText[2]);
          if (textType === 'reference') reference = reference || textValue;
          else if (textType === 'value') value = value || textValue;

          const textAt = getXY(fpText, 'at');
          const textLayer = getStringValue(fpText, 'layer') ?? layer;
          const effects = findExpr(fpText, 'effects');
          let fontSize = 1.0;
          let visible = true;
          if (effects) {
            const font = findExpr(effects, 'font');
            if (font) {
              const sz = getSize(font, 'size');
              if (sz) fontSize = sz.h;
            }
            if ((effects as SExpr[]).includes('hide')) visible = false;
          }
          texts.push({
            type: textType, text: textValue,
            x: textAt?.x ?? 0, y: textAt?.y ?? 0,
            rotation: textAt?.rotation ?? 0,
            layer: textLayer, fontSize, visible,
          });
        }
      }

      // Pads
      const pads = this.parsePads(fp, pcbLayers);

      // Footprint graphics
      const graphics = this.parseFpGraphics(fp);

      return {
        reference, value, libId,
        x: at?.x ?? 0, y: at?.y ?? 0, rotation: at?.rotation ?? 0,
        layer, pads, graphics, texts, raw: fp,
      };
    });
  }

  private parsePads(fp: SExpr[], pcbLayers: PcbLayer[]): PcbPad[] {
    return findAllExpr(fp, 'pad').map(pad => {
      const number = pad.length > 1 ? String(pad[1]) : '';
      const type = pad.length > 2 ? String(pad[2]) : 'smd';
      const shape = pad.length > 3 ? String(pad[3]) : 'rect';
      const at = getXY(pad, 'at');
      const size = getSize(pad, 'size');
      const drillExpr = findExpr(pad, 'drill');
      const drill = drillExpr && drillExpr.length > 1 ? Number(drillExpr[1]) : 0;
      const rrExpr = findExpr(pad, 'roundrect_rratio');
      const roundrectRatio = rrExpr && rrExpr.length > 1 ? Number(rrExpr[1]) : 0.25;

      const layersExpr = findExpr(pad, 'layers');
      const layers: string[] = [];
      if (layersExpr) {
        for (let i = 1; i < layersExpr.length; i++) {
          let lname = String(layersExpr[i]);
          // Expand wildcard layers using actual PCB layer table
          if (lname === '*.Cu') {
            for (const l of pcbLayers) {
              if (l.name.endsWith('.Cu')) layers.push(l.name);
            }
          } else if (lname === '*.Mask') {
            layers.push('F.Mask', 'B.Mask');
          } else if (lname === '*.Paste') {
            layers.push('F.Paste', 'B.Paste');
          } else {
            layers.push(lname);
          }
        }
      }

      const netExpr = findExpr(pad, 'net');
      const net = netExpr && netExpr.length > 1 ? Number(netExpr[1]) : 0;
      const netName = netExpr && netExpr.length > 2 ? String(netExpr[2]) : '';

      return {
        number, type, shape,
        x: at?.x ?? 0, y: at?.y ?? 0,
        rotation: at?.rotation ?? 0,
        sizeX: size?.w ?? 1, sizeY: size?.h ?? 1,
        drill, layers, net, netName, roundrectRatio,
      };
    });
  }

  private parseFpGraphics(fp: SExpr[]): FpGraphic[] {
    const graphics: FpGraphic[] = [];

    // fp_line
    for (const item of findAllExpr(fp, 'fp_line')) {
      const start = getXY(item, 'start');
      const end = getXY(item, 'end');
      const layer = getStringValue(item, 'layer') ?? '';
      const width = this.getItemWidth(item);
      graphics.push({
        type: 'line', layer, width,
        startX: start?.x ?? 0, startY: start?.y ?? 0,
        endX: end?.x ?? 0, endY: end?.y ?? 0,
      });
    }

    // fp_rect
    for (const item of findAllExpr(fp, 'fp_rect')) {
      const start = getXY(item, 'start');
      const end = getXY(item, 'end');
      const layer = getStringValue(item, 'layer') ?? '';
      const width = this.getItemWidth(item);
      const fill = this.getFillType(item);
      graphics.push({
        type: 'rect', layer, width, fill,
        startX: start?.x ?? 0, startY: start?.y ?? 0,
        endX: end?.x ?? 0, endY: end?.y ?? 0,
      });
    }

    // fp_circle
    for (const item of findAllExpr(fp, 'fp_circle')) {
      const center = getXY(item, 'center');
      const end = getXY(item, 'end');
      const layer = getStringValue(item, 'layer') ?? '';
      const width = this.getItemWidth(item);
      const fill = this.getFillType(item);
      const cx = center?.x ?? 0, cy = center?.y ?? 0;
      const ex = end?.x ?? 0, ey = end?.y ?? 0;
      const radius = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
      graphics.push({
        type: 'circle', layer, width, fill,
        centerX: cx, centerY: cy, radius,
      });
    }

    // fp_arc
    for (const item of findAllExpr(fp, 'fp_arc')) {
      const start = getXY(item, 'start');
      const mid = getXY(item, 'mid');
      const end = getXY(item, 'end');
      const layer = getStringValue(item, 'layer') ?? '';
      const width = this.getItemWidth(item);
      graphics.push({
        type: 'arc', layer, width,
        arcStartX: start?.x ?? 0, arcStartY: start?.y ?? 0,
        arcMidX: mid?.x ?? 0, arcMidY: mid?.y ?? 0,
        arcEndX: end?.x ?? 0, arcEndY: end?.y ?? 0,
      });
    }

    // fp_poly
    for (const item of findAllExpr(fp, 'fp_poly')) {
      const pts = findExpr(item, 'pts');
      const layer = getStringValue(item, 'layer') ?? '';
      const width = this.getItemWidth(item);
      const fill = this.getFillType(item);
      const points: { x: number; y: number }[] = [];
      if (pts) {
        for (const xy of findAllExpr(pts, 'xy')) {
          points.push({ x: Number(xy[1]), y: Number(xy[2]) });
        }
      }
      graphics.push({ type: 'poly', layer, width, fill, points });
    }

    return graphics;
  }

  private parseTracks(root: SExpr[]): PcbTrack[] {
    return findAllExpr(root, 'segment').map(seg => ({
      startX: getXY(seg, 'start')?.x ?? 0,
      startY: getXY(seg, 'start')?.y ?? 0,
      endX: getXY(seg, 'end')?.x ?? 0,
      endY: getXY(seg, 'end')?.y ?? 0,
      width: getNumberValue(seg, 'width') ?? 0.25,
      layer: getStringValue(seg, 'layer') ?? 'F.Cu',
      net: getNumberValue(seg, 'net') ?? 0,
    }));
  }

  private parseVias(root: SExpr[]): PcbVia[] {
    return findAllExpr(root, 'via').map(via => {
      const layersExpr = findExpr(via, 'layers');
      const layers: string[] = [];
      if (layersExpr) {
        for (let i = 1; i < layersExpr.length; i++) layers.push(String(layersExpr[i]));
      }
      return {
        x: getXY(via, 'at')?.x ?? 0,
        y: getXY(via, 'at')?.y ?? 0,
        size: getNumberValue(via, 'size') ?? 0.8,
        drill: getNumberValue(via, 'drill') ?? 0.4,
        layers, net: getNumberValue(via, 'net') ?? 0,
      };
    });
  }

  private parseBoardOutline(root: SExpr[]): BoardLine[] {
    const lines: BoardLine[] = [];

    // gr_line on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_line')) {
      const layer = getStringValue(item, 'layer');
      if (layer !== 'Edge.Cuts') continue;
      const start = getXY(item, 'start');
      const end = getXY(item, 'end');
      const width = this.getItemWidth(item);
      lines.push({
        type: 'line', layer: 'Edge.Cuts', width,
        startX: start?.x ?? 0, startY: start?.y ?? 0,
        endX: end?.x ?? 0, endY: end?.y ?? 0,
      });
    }

    // gr_arc on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_arc')) {
      const layer = getStringValue(item, 'layer');
      if (layer !== 'Edge.Cuts') continue;
      const start = getXY(item, 'start');
      const mid = getXY(item, 'mid');
      const end = getXY(item, 'end');
      const width = this.getItemWidth(item);
      lines.push({
        type: 'arc', layer: 'Edge.Cuts', width,
        startX: start?.x ?? 0, startY: start?.y ?? 0,
        endX: end?.x ?? 0, endY: end?.y ?? 0,
        midX: mid?.x, midY: mid?.y,
      });
    }

    // gr_rect on Edge.Cuts → 4 lines
    for (const item of findAllExpr(root, 'gr_rect')) {
      const layer = getStringValue(item, 'layer');
      if (layer !== 'Edge.Cuts') continue;
      const start = getXY(item, 'start');
      const end = getXY(item, 'end');
      if (!start || !end) continue;
      const width = this.getItemWidth(item);
      lines.push(
        { type: 'line', layer: 'Edge.Cuts', width, startX: start.x, startY: start.y, endX: end.x, endY: start.y },
        { type: 'line', layer: 'Edge.Cuts', width, startX: end.x, startY: start.y, endX: end.x, endY: end.y },
        { type: 'line', layer: 'Edge.Cuts', width, startX: end.x, startY: end.y, endX: start.x, endY: end.y },
        { type: 'line', layer: 'Edge.Cuts', width, startX: start.x, startY: end.y, endX: start.x, endY: start.y },
      );
    }

    // gr_circle on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_circle')) {
      const layer = getStringValue(item, 'layer');
      if (layer !== 'Edge.Cuts') continue;
      const center = getXY(item, 'center');
      const end = getXY(item, 'end');
      if (!center || !end) continue;
      const width = this.getItemWidth(item);
      lines.push({
        type: 'circle', layer: 'Edge.Cuts', width,
        startX: center.x, startY: center.y,
        endX: end.x, endY: end.y,
      });
    }

    // gr_poly on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_poly')) {
      const layer = getStringValue(item, 'layer');
      if (layer !== 'Edge.Cuts') continue;
      const pts = findExpr(item, 'pts');
      const points: { x: number; y: number }[] = [];
      if (pts) {
        for (const xy of findAllExpr(pts, 'xy')) {
          points.push({ x: Number(xy[1]), y: Number(xy[2]) });
        }
      }
      const width = this.getItemWidth(item);
      if (points.length >= 2) {
        lines.push({
          type: 'poly', layer: 'Edge.Cuts', width,
          startX: points[0].x, startY: points[0].y,
          endX: points[points.length - 1].x, endY: points[points.length - 1].y,
          points,
        });
      }
    }

    return lines;
  }

  private parseGraphicItems(root: SExpr[]): BoardLine[] {
    const items: BoardLine[] = [];

    // All gr_line NOT on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_line')) {
      const layer = getStringValue(item, 'layer') ?? '';
      if (layer === 'Edge.Cuts') continue;
      const start = getXY(item, 'start');
      const end = getXY(item, 'end');
      const width = this.getItemWidth(item);
      items.push({
        type: 'line', layer, width,
        startX: start?.x ?? 0, startY: start?.y ?? 0,
        endX: end?.x ?? 0, endY: end?.y ?? 0,
      });
    }

    // gr_arc NOT on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_arc')) {
      const layer = getStringValue(item, 'layer') ?? '';
      if (layer === 'Edge.Cuts') continue;
      const start = getXY(item, 'start');
      const mid = getXY(item, 'mid');
      const end = getXY(item, 'end');
      const width = this.getItemWidth(item);
      items.push({
        type: 'arc', layer, width,
        startX: start?.x ?? 0, startY: start?.y ?? 0,
        endX: end?.x ?? 0, endY: end?.y ?? 0,
        midX: mid?.x, midY: mid?.y,
      });
    }

    // gr_rect NOT on Edge.Cuts → 4 lines
    for (const item of findAllExpr(root, 'gr_rect')) {
      const layer = getStringValue(item, 'layer') ?? '';
      if (layer === 'Edge.Cuts') continue;
      const start = getXY(item, 'start');
      const end = getXY(item, 'end');
      if (!start || !end) continue;
      const width = this.getItemWidth(item);
      items.push(
        { type: 'line', layer, width, startX: start.x, startY: start.y, endX: end.x, endY: start.y },
        { type: 'line', layer, width, startX: end.x, startY: start.y, endX: end.x, endY: end.y },
        { type: 'line', layer, width, startX: end.x, startY: end.y, endX: start.x, endY: end.y },
        { type: 'line', layer, width, startX: start.x, startY: end.y, endX: start.x, endY: start.y },
      );
    }

    // gr_circle NOT on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_circle')) {
      const layer = getStringValue(item, 'layer') ?? '';
      if (layer === 'Edge.Cuts') continue;
      const center = getXY(item, 'center');
      const end = getXY(item, 'end');
      if (!center || !end) continue;
      const width = this.getItemWidth(item);
      items.push({
        type: 'circle', layer, width,
        startX: center.x, startY: center.y,
        endX: end.x, endY: end.y,
      });
    }

    // gr_poly NOT on Edge.Cuts
    for (const item of findAllExpr(root, 'gr_poly')) {
      const layer = getStringValue(item, 'layer') ?? '';
      if (layer === 'Edge.Cuts') continue;
      const pts = findExpr(item, 'pts');
      const points: { x: number; y: number }[] = [];
      if (pts) {
        for (const xy of findAllExpr(pts, 'xy')) {
          points.push({ x: Number(xy[1]), y: Number(xy[2]) });
        }
      }
      const width = this.getItemWidth(item);
      const fillType = this.getFillType(item);
      if (points.length >= 2) {
        items.push({
          type: 'poly', layer, width, fill: fillType,
          startX: points[0].x, startY: points[0].y,
          endX: points[points.length - 1].x, endY: points[points.length - 1].y,
          points,
        });
      }
    }

    return items;
  }

  private parseZones(root: SExpr[]): PcbZone[] {
    const zones: PcbZone[] = [];

    for (const zone of findAllExpr(root, 'zone')) {
      const netExpr = findExpr(zone, 'net');
      const net = netExpr && netExpr.length > 1 ? Number(netExpr[1]) : 0;
      const netName = getStringValue(zone, 'net_name') ?? '';

      // Layer(s) — handle both KiCad 7 (layer) and KiCad 8+ (layers)
      const singleLayer = getStringValue(zone, 'layer');
      const layersExpr = findExpr(zone, 'layers');
      const zoneLayers: string[] = [];
      if (singleLayer) {
        zoneLayers.push(singleLayer);
      } else if (layersExpr) {
        for (let i = 1; i < layersExpr.length; i++) {
          zoneLayers.push(String(layersExpr[i]));
        }
      }
      if (zoneLayers.length === 0) zoneLayers.push('F.Cu');

      // Get all filled_polygon entries (there may be one per layer)
      const filledPolygons = findAllExpr(zone, 'filled_polygon');

      if (filledPolygons.length > 0) {
        for (const filledPoly of filledPolygons) {
          const fpLayer = getStringValue(filledPoly, 'layer') ?? zoneLayers[0];
          const pts = findExpr(filledPoly, 'pts');
          const points: { x: number; y: number }[] = [];
          if (pts) {
            for (const xy of findAllExpr(pts, 'xy')) {
              points.push({ x: Number(xy[1]), y: Number(xy[2]) });
            }
          }
          if (points.length >= 3) {
            zones.push({ net, netName, layer: fpLayer, points });
          }
        }
      } else {
        // Fallback: try outline polygon
        const polygon = findExpr(zone, 'polygon');
        const pts = polygon ? findExpr(polygon, 'pts') : undefined;
        const points: { x: number; y: number }[] = [];
        if (pts) {
          for (const xy of findAllExpr(pts, 'xy')) {
            points.push({ x: Number(xy[1]), y: Number(xy[2]) });
          }
        }
        if (points.length >= 3) {
          for (const l of zoneLayers) {
            zones.push({ net, netName, layer: l, points: [...points] });
          }
        }
      }
    }

    return zones;
  }

  private getItemWidth(expr: SExpr[]): number {
    // Try (stroke (width N)) first (KiCad 7+)
    const stroke = findExpr(expr, 'stroke');
    if (stroke) {
      const w = findExpr(stroke, 'width');
      if (w && w.length > 1) return Number(w[1]) || 0.1;
    }
    // Fall back to (width N)
    const w = getNumberValue(expr, 'width');
    return w ?? 0.1;
  }

  private getFillType(expr: SExpr[]): string {
    const fill = findExpr(expr, 'fill');
    if (!fill) return 'none';
    const type = findExpr(fill, 'type');
    return type ? String(type[1]) : 'none';
  }
}
