/**
 * KiCad Schematic (.kicad_sch) Parser
 *
 * Parses the S-expression based schematic file format.
 * Extracts symbols, wires, junctions, labels, and lib_symbols graphics.
 */

import {
  parseSExpression, findExpr, findAllExpr,
  getStringValue, getNumberValue, getXY, getSize,
  type SExpr,
} from './sexpr';

// --- Types ---

export interface SchematicPin {
  x: number;
  y: number;
  name?: string;
  number?: string;
}

export interface SymbolProperty {
  value: string;
  x: number;
  y: number;
  rotation: number;
  visible: boolean;
  fontSize: number;
}

export interface SchematicElement {
  type: 'symbol';
  id: string;
  libId: string;
  reference: string;
  value: string;
  footprint: string;
  x: number;
  y: number;
  rotation: number;
  mirror: string; // 'x', 'y', or ''
  unit: number;
  convert: number;
  pins: SchematicPin[];
  properties: Record<string, SymbolProperty>;
  raw: SExpr[];
}

export interface Wire {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface Junction {
  x: number;
  y: number;
}

export interface Label {
  text: string;
  x: number;
  y: number;
  rotation: number;
  type: 'net' | 'global' | 'hierarchical';
}

export interface NoConnect {
  x: number;
  y: number;
}

export interface SheetPin {
  name: string;
  type: string; // 'input', 'output', 'bidirectional', 'tri_state', 'passive'
  x: number;
  y: number;
  rotation: number;
}

export interface Sheet {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  fileName: string;
  uuid: string;
  pins: SheetPin[];
}

export interface Bus {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface BusEntry {
  x: number;
  y: number;
  sizeW: number;
  sizeH: number;
}

// --- Library Symbol Graphics ---

export interface LibGraphic {
  type: 'polyline' | 'rectangle' | 'circle' | 'arc';
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  center?: { x: number; y: number };
  radius?: number;
  arcStart?: { x: number; y: number };
  arcMid?: { x: number; y: number };
  arcEnd?: { x: number; y: number };
  fillType: string;
  strokeWidth: number;
}

export interface LibPin {
  name: string;
  number: string;
  x: number;
  y: number;
  length: number;
  rotation: number;
  type: string;
  graphicStyle: string;
}

export interface LibSymbolUnit {
  unitNum: number;
  convertNum: number;
  graphics: LibGraphic[];
  pins: LibPin[];
}

export interface LibSymbol {
  name: string;
  pinNamesOffset: number;
  showPinNames: boolean;
  showPinNumbers: boolean;
  units: LibSymbolUnit[];
}

export interface SchematicData {
  version: number;
  generator: string;
  uuid: string;
  paperSize: string;
  symbols: SchematicElement[];
  wires: Wire[];
  junctions: Junction[];
  labels: Label[];
  noConnects: NoConnect[];
  sheets: Sheet[];
  buses: Bus[];
  busEntries: BusEntry[];
  libSymbols: Map<string, LibSymbol>;
  raw: SExpr[];
}

// --- Parser ---

export class KicadSchematicParser {
  parse(content: string): SchematicData {
    const exprs = parseSExpression(content);

    const root = exprs[0];
    if (!Array.isArray(root) || root[0] !== 'kicad_sch') {
      throw new Error('Invalid KiCad schematic file: root expression must be "kicad_sch"');
    }

    const version = getNumberValue(root, 'version') ?? 0;
    const generator = getStringValue(root, 'generator') ?? 'unknown';
    const uuid = getStringValue(root, 'uuid') ?? '';

    const paper = findExpr(root, 'paper');
    const paperSize = paper ? String(paper[1]) : 'A4';

    const libSymbols = this.parseLibSymbols(root);
    const symbols = this.parseSymbols(root);
    const wires = this.parseWires(root);
    const junctions = this.parseJunctions(root);
    const labels = this.parseLabels(root);
    const noConnects = this.parseNoConnects(root);
    const sheets = this.parseSheets(root);
    const buses = this.parseBuses(root);
    const busEntries = this.parseBusEntries(root);

    return {
      version, generator, uuid, paperSize,
      symbols, wires, junctions, labels, noConnects,
      sheets, buses, busEntries,
      libSymbols, raw: root,
    };
  }

  // --- Library Symbols ---

  private parseLibSymbols(root: SExpr[]): Map<string, LibSymbol> {
    const libSymbolsExpr = findExpr(root, 'lib_symbols');
    if (!libSymbolsExpr) return new Map();

    const result = new Map<string, LibSymbol>();

    for (const symExpr of findAllExpr(libSymbolsExpr, 'symbol')) {
      if (!Array.isArray(symExpr) || symExpr.length < 2) continue;
      const name = String(symExpr[1]);

      // Pin names settings
      const pinNamesExpr = findExpr(symExpr, 'pin_names');
      let pinNamesOffset = 1.0;
      let showPinNames = true;
      if (pinNamesExpr) {
        const offsetExpr = findExpr(pinNamesExpr, 'offset');
        if (offsetExpr) pinNamesOffset = Number(offsetExpr[1]) || 0;
        if ((pinNamesExpr as SExpr[]).includes('hide')) showPinNames = false;
      }

      const pinNumbersExpr = findExpr(symExpr, 'pin_numbers');
      let showPinNumbers = true;
      if (pinNumbersExpr && (pinNumbersExpr as SExpr[]).includes('hide')) {
        showPinNumbers = false;
      }

      const units: LibSymbolUnit[] = [];

      // Sub-symbol definitions: "LibName:SymName_unitNum_convertNum"
      for (const subSym of findAllExpr(symExpr, 'symbol')) {
        if (!Array.isArray(subSym) || subSym.length < 2) continue;
        const subName = String(subSym[1]);
        const match = subName.match(/_(\d+)_(\d+)$/);
        const unitNum = match ? parseInt(match[1]) : 0;
        const convertNum = match ? parseInt(match[2]) : 1;

        const graphics = this.parseLibGraphics(subSym);
        const pins = this.parseLibPins(subSym);
        units.push({ unitNum, convertNum, graphics, pins });
      }

      result.set(name, { name, pinNamesOffset, showPinNames, showPinNumbers, units });
    }

    return result;
  }

  private parseLibGraphics(expr: SExpr[]): LibGraphic[] {
    const graphics: LibGraphic[] = [];

    // Polylines
    for (const pl of findAllExpr(expr, 'polyline')) {
      const pts = findExpr(pl, 'pts');
      const points: { x: number; y: number }[] = [];
      if (pts) {
        for (const xy of findAllExpr(pts, 'xy')) {
          points.push({ x: Number(xy[1]), y: Number(xy[2]) });
        }
      }
      graphics.push({
        type: 'polyline', points,
        fillType: this.getFillType(pl),
        strokeWidth: this.getStrokeWidth(pl),
      });
    }

    // Rectangles
    for (const rect of findAllExpr(expr, 'rectangle')) {
      const start = getXY(rect, 'start');
      const end = getXY(rect, 'end');
      graphics.push({
        type: 'rectangle',
        start: start ? { x: start.x, y: start.y } : { x: 0, y: 0 },
        end: end ? { x: end.x, y: end.y } : { x: 0, y: 0 },
        fillType: this.getFillType(rect),
        strokeWidth: this.getStrokeWidth(rect),
      });
    }

    // Circles
    for (const circ of findAllExpr(expr, 'circle')) {
      const center = getXY(circ, 'center');
      const radiusVal = getNumberValue(circ, 'radius') ?? 0;
      graphics.push({
        type: 'circle',
        center: center ? { x: center.x, y: center.y } : { x: 0, y: 0 },
        radius: radiusVal,
        fillType: this.getFillType(circ),
        strokeWidth: this.getStrokeWidth(circ),
      });
    }

    // Arcs
    for (const arc of findAllExpr(expr, 'arc')) {
      const arcStart = getXY(arc, 'start');
      const arcMid = getXY(arc, 'mid');
      const arcEnd = getXY(arc, 'end');
      graphics.push({
        type: 'arc',
        arcStart: arcStart ? { x: arcStart.x, y: arcStart.y } : { x: 0, y: 0 },
        arcMid: arcMid ? { x: arcMid.x, y: arcMid.y } : { x: 0, y: 0 },
        arcEnd: arcEnd ? { x: arcEnd.x, y: arcEnd.y } : { x: 0, y: 0 },
        fillType: this.getFillType(arc),
        strokeWidth: this.getStrokeWidth(arc),
      });
    }

    return graphics;
  }

  private parseLibPins(expr: SExpr[]): LibPin[] {
    const pins: LibPin[] = [];
    for (const pin of findAllExpr(expr, 'pin')) {
      // (pin type graphicStyle (at x y rot) (length len) (name "n" ...) (number "n" ...))
      const type = pin.length > 1 ? String(pin[1]) : 'passive';
      const graphicStyle = pin.length > 2 ? String(pin[2]) : 'line';
      const at = getXY(pin, 'at');
      const lengthExpr = findExpr(pin, 'length');
      const length = lengthExpr && lengthExpr.length > 1 ? Number(lengthExpr[1]) : 2.54;
      const nameExpr = findExpr(pin, 'name');
      const numberExpr = findExpr(pin, 'number');

      pins.push({
        name: nameExpr && nameExpr.length > 1 ? String(nameExpr[1]) : '',
        number: numberExpr && numberExpr.length > 1 ? String(numberExpr[1]) : '',
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        length,
        rotation: at?.rotation ?? 0,
        type,
        graphicStyle,
      });
    }
    return pins;
  }

  private getFillType(expr: SExpr[]): string {
    const fill = findExpr(expr, 'fill');
    if (!fill) return 'none';
    const type = findExpr(fill, 'type');
    return type ? String(type[1]) : 'none';
  }

  private getStrokeWidth(expr: SExpr[]): number {
    const stroke = findExpr(expr, 'stroke');
    if (!stroke) return 0;
    const width = findExpr(stroke, 'width');
    return width ? Number(width[1]) : 0;
  }

  // --- Placed Symbols ---

  private parseSymbols(root: SExpr[]): SchematicElement[] {
    const symbolExprs = findAllExpr(root, 'symbol');
    const symbols: SchematicElement[] = [];

    for (const sexpr of symbolExprs) {
      // Only process placed symbols (they have a lib_id child)
      const libId = findExpr(sexpr, 'lib_id');
      if (!libId) continue;

      const at = getXY(sexpr, 'at');
      const mirrorExpr = findExpr(sexpr, 'mirror');
      const mirrorVal = mirrorExpr && mirrorExpr.length > 1 ? String(mirrorExpr[1]) : '';
      const uuid = getStringValue(sexpr, 'uuid') ?? '';
      const unit = getNumberValue(sexpr, 'unit') ?? 1;
      const convert = getNumberValue(sexpr, 'convert') ?? 1;

      // Parse properties with positions
      const properties: Record<string, SymbolProperty> = {};
      for (const prop of findAllExpr(sexpr, 'property')) {
        if (prop.length >= 3) {
          const key = String(prop[1]);
          const val = String(prop[2]);
          const propAt = getXY(prop, 'at');
          const effects = findExpr(prop, 'effects');
          let visible = true;
          let fontSize = 1.27;
          if (effects) {
            if ((effects as SExpr[]).includes('hide')) visible = false;
            const hideExpr = findExpr(effects, 'hide');
            if (hideExpr && String(hideExpr[1]) === 'yes') visible = false;
            const fontExpr = findExpr(effects, 'font');
            if (fontExpr) {
              const sizeExpr = getSize(fontExpr, 'size');
              if (sizeExpr) fontSize = sizeExpr.h;
            }
          }
          properties[key] = {
            value: val,
            x: propAt?.x ?? (at?.x ?? 0),
            y: propAt?.y ?? (at?.y ?? 0),
            rotation: propAt?.rotation ?? 0,
            visible,
            fontSize,
          };
        }
      }

      // Pins from the placed symbol
      const pinExprs = findAllExpr(sexpr, 'pin');
      const pins: SchematicPin[] = pinExprs.map(pin => {
        const pinAt = getXY(pin, 'at');
        return {
          x: pinAt?.x ?? 0,
          y: pinAt?.y ?? 0,
          name: getStringValue(pin, 'name'),
          number: getStringValue(pin, 'number'),
        };
      });

      symbols.push({
        type: 'symbol',
        id: uuid,
        libId: String(libId[1]),
        reference: properties['Reference']?.value ?? '',
        value: properties['Value']?.value ?? '',
        footprint: properties['Footprint']?.value ?? '',
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        rotation: at?.rotation ?? 0,
        mirror: mirrorVal,
        unit,
        convert,
        pins,
        properties,
        raw: sexpr,
      });
    }

    return symbols;
  }

  // --- Wires, Junctions, Labels, No-connects ---

  private parseWires(root: SExpr[]): Wire[] {
    const wireExprs = findAllExpr(root, 'wire');
    return wireExprs.map(wire => {
      const pts = findExpr(wire, 'pts');
      if (!pts) return { startX: 0, startY: 0, endX: 0, endY: 0 };
      const xyExprs = findAllExpr(pts, 'xy');
      const start = xyExprs[0];
      const end = xyExprs[1];
      return {
        startX: start ? Number(start[1]) : 0,
        startY: start ? Number(start[2]) : 0,
        endX: end ? Number(end[1]) : 0,
        endY: end ? Number(end[2]) : 0,
      };
    });
  }

  private parseJunctions(root: SExpr[]): Junction[] {
    return findAllExpr(root, 'junction').map(j => {
      const at = getXY(j, 'at');
      return { x: at?.x ?? 0, y: at?.y ?? 0 };
    });
  }

  private parseLabels(root: SExpr[]): Label[] {
    const labels: Label[] = [];

    for (const l of findAllExpr(root, 'label')) {
      const at = getXY(l, 'at');
      labels.push({
        text: l.length > 1 ? String(l[1]) : '',
        x: at?.x ?? 0, y: at?.y ?? 0,
        rotation: at?.rotation ?? 0,
        type: 'net',
      });
    }

    for (const l of findAllExpr(root, 'global_label')) {
      const at = getXY(l, 'at');
      labels.push({
        text: l.length > 1 ? String(l[1]) : '',
        x: at?.x ?? 0, y: at?.y ?? 0,
        rotation: at?.rotation ?? 0,
        type: 'global',
      });
    }

    for (const l of findAllExpr(root, 'hierarchical_label')) {
      const at = getXY(l, 'at');
      labels.push({
        text: l.length > 1 ? String(l[1]) : '',
        x: at?.x ?? 0, y: at?.y ?? 0,
        rotation: at?.rotation ?? 0,
        type: 'hierarchical',
      });
    }

    return labels;
  }

  private parseNoConnects(root: SExpr[]): NoConnect[] {
    return findAllExpr(root, 'no_connect').map(nc => {
      const at = getXY(nc, 'at');
      return { x: at?.x ?? 0, y: at?.y ?? 0 };
    });
  }

  private parseSheets(root: SExpr[]): Sheet[] {
    return findAllExpr(root, 'sheet').map(sh => {
      const at = getXY(sh, 'at');
      const size = getSize(sh, 'size');
      const uuid = getStringValue(sh, 'uuid') ?? '';

      // Properties
      const properties: Record<string, string> = {};
      for (const prop of findAllExpr(sh, 'property')) {
        if (prop.length >= 3) {
          properties[String(prop[1])] = String(prop[2]);
        }
      }

      // Sheet pins
      const pins: SheetPin[] = [];
      for (const pin of findAllExpr(sh, 'pin')) {
        const pinName = pin.length > 1 ? String(pin[1]) : '';
        const pinType = pin.length > 2 ? String(pin[2]) : 'passive';
        const pinAt = getXY(pin, 'at');
        pins.push({
          name: pinName,
          type: pinType,
          x: pinAt?.x ?? 0,
          y: pinAt?.y ?? 0,
          rotation: pinAt?.rotation ?? 0,
        });
      }

      return {
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        width: size?.w ?? 10,
        height: size?.h ?? 10,
        name: properties['Sheetname'] ?? properties['Sheet name'] ?? '',
        fileName: properties['Sheetfile'] ?? properties['Sheet file'] ?? '',
        uuid,
        pins,
      };
    });
  }

  private parseBuses(root: SExpr[]): Bus[] {
    return findAllExpr(root, 'bus').map(bus => {
      const pts = findExpr(bus, 'pts');
      if (!pts) return { startX: 0, startY: 0, endX: 0, endY: 0 };
      const xyExprs = findAllExpr(pts, 'xy');
      const start = xyExprs[0];
      const end = xyExprs[1];
      return {
        startX: start ? Number(start[1]) : 0,
        startY: start ? Number(start[2]) : 0,
        endX: end ? Number(end[1]) : 0,
        endY: end ? Number(end[2]) : 0,
      };
    });
  }

  private parseBusEntries(root: SExpr[]): BusEntry[] {
    return findAllExpr(root, 'bus_entry').map(be => {
      const at = getXY(be, 'at');
      const size = getSize(be, 'size');
      return {
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        sizeW: size?.w ?? 2.54,
        sizeH: size?.h ?? 2.54,
      };
    });
  }
}
