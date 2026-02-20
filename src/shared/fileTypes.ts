/** Get the extension from a file path (works in both Node.js and browser) */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastDot <= lastSlash) return '';
  return filePath.slice(lastDot).toLowerCase();
}

/** File extension to KiCad file type mapping */
export function getKicadFileType(filePath: string): import('./types').KicadFileType {
  const ext = getExtension(filePath);
  switch (ext) {
    case '.kicad_sch': return 'schematic';
    case '.kicad_pcb': return 'pcb';
    case '.kicad_pro': return 'project';
    case '.kicad_sym': return 'symbol-lib';
    case '.kicad_mod': return 'footprint';
    case '.gbr': case '.gtl': case '.gbl': case '.gts': case '.gbs':
    case '.gto': case '.gbo': case '.gtp': case '.gbp':
    case '.gm1': case '.gko': case '.drl': case '.xln':
      return 'gerber';
    case '.step': case '.stp': case '.wrl': case '.vrml':
      return '3d-model';
    case '.pdf':
      return 'pdf';
    case '.png': case '.jpg': case '.jpeg': case '.gif':
    case '.bmp': case '.webp': case '.svg': case '.ico':
      return 'image';
    case '.md': case '.markdown':
      return 'markdown';
    default: return 'unknown';
  }
}

/** Check if a file is a KiCad project file */
export function isKicadProject(filePath: string): boolean {
  return getExtension(filePath) === '.kicad_pro';
}

/** Known KiCad file extensions */
export const KICAD_EXTENSIONS = [
  '.kicad_pro', '.kicad_sch', '.kicad_pcb',
  '.kicad_sym', '.kicad_mod', '.kicad_dru',
  '.kicad_wks',
] as const;

/** Gerber file extensions */
export const GERBER_EXTENSIONS = [
  '.gbr', '.gtl', '.gbl', '.gts', '.gbs',
  '.gto', '.gbo', '.gtp', '.gbp', '.gm1',
  '.gko', '.drl', '.xln', '.gbrjob',
] as const;

/** 3D model extensions */
export const MODEL_3D_EXTENSIONS = [
  '.step', '.stp', '.wrl', '.vrml',
] as const;
