/**
 * KiCad S-Expression Tokenizer & Parser
 * 
 * Parses KiCad's S-expression format used in .kicad_sch, .kicad_pcb, etc.
 * Based on the KiCad file format specification.
 */

export type SExpr = string | number | SExpr[];

/** Tokenize an S-expression string into a nested array structure */
export function parseSExpression(input: string): SExpr[] {
  const result: SExpr[] = [];
  const stack: SExpr[][] = [result];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === '(') {
      const newList: SExpr[] = [];
      stack[stack.length - 1].push(newList);
      stack.push(newList);
      i++;
    } else if (ch === ')') {
      stack.pop();
      if (stack.length === 0) {
        // Unmatched closing paren, create new root
        stack.push(result);
      }
      i++;
    } else if (ch === '"') {
      // Quoted string
      let str = '';
      i++; // skip opening quote
      while (i < len && input[i] !== '"') {
        if (input[i] === '\\') {
          i++;
          if (i < len) {
            str += input[i];
          }
        } else {
          str += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      stack[stack.length - 1].push(str);
    } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
    } else {
      // Atom (unquoted token)
      let atom = '';
      while (i < len && input[i] !== ' ' && input[i] !== '\t' && 
             input[i] !== '\n' && input[i] !== '\r' && 
             input[i] !== '(' && input[i] !== ')' && input[i] !== '"') {
        atom += input[i];
        i++;
      }
      
      // Try to parse as number
      const num = Number(atom);
      if (!isNaN(num) && atom !== '') {
        stack[stack.length - 1].push(num);
      } else {
        stack[stack.length - 1].push(atom);
      }
    }
  }

  return result;
}

/** Find a child expression by its first element (tag name) */
export function findExpr(expr: SExpr[], tag: string): SExpr[] | undefined {
  for (const child of expr) {
    if (Array.isArray(child) && child[0] === tag) {
      return child;
    }
  }
  return undefined;
}

/** Find all child expressions matching a tag */
export function findAllExpr(expr: SExpr[], tag: string): SExpr[][] {
  const results: SExpr[][] = [];
  for (const child of expr) {
    if (Array.isArray(child) && child[0] === tag) {
      results.push(child);
    }
  }
  return results;
}

/** Get a string value from a tagged expression: (tag "value") -> "value" */
export function getStringValue(expr: SExpr[], tag: string): string | undefined {
  const found = findExpr(expr, tag);
  if (found && found.length > 1) {
    return String(found[1]);
  }
  return undefined;
}

/** Get a number value from a tagged expression: (tag 123) -> 123 */
export function getNumberValue(expr: SExpr[], tag: string): number | undefined {
  const found = findExpr(expr, tag);
  if (found && found.length > 1) {
    return Number(found[1]);
  }
  return undefined;
}

/** Get XY coordinates from: (at 10 20) or (xy 10 20) */
export function getXY(expr: SExpr[], tag: string = 'at'): { x: number; y: number; rotation?: number } | undefined {
  const found = findExpr(expr, tag);
  if (found && found.length >= 3) {
    return {
      x: Number(found[1]),
      y: Number(found[2]),
      rotation: found.length > 3 ? Number(found[3]) : undefined,
    };
  }
  return undefined;
}

/** Get size from: (size 10 20) */
export function getSize(expr: SExpr[], tag: string = 'size'): { w: number; h: number } | undefined {
  const found = findExpr(expr, tag);
  if (found && found.length >= 3) {
    return { w: Number(found[1]), h: Number(found[2]) };
  }
  return undefined;
}

/** Serialize S-expression back to string */
export function serializeSExpression(expr: SExpr, indent: number = 0): string {
  if (typeof expr === 'string') {
    // Quote strings that contain spaces or special characters
    if (expr.includes(' ') || expr.includes('(') || expr.includes(')') || expr.includes('"')) {
      return `"${expr.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return expr;
  }
  if (typeof expr === 'number') {
    return String(expr);
  }
  if (Array.isArray(expr)) {
    if (expr.length === 0) return '()';
    
    const tag = expr[0];
    const children = expr.slice(1);
    
    // Simple expressions on one line
    const isSimple = children.every(c => !Array.isArray(c) || (Array.isArray(c) && c.length <= 3));
    
    if (isSimple && children.length <= 4) {
      const parts = expr.map(e => serializeSExpression(e, indent + 1));
      const oneLine = `(${parts.join(' ')})`;
      if (oneLine.length < 100) return oneLine;
    }

    // Multi-line for complex expressions
    const indentStr = '\t'.repeat(indent);
    const childIndent = '\t'.repeat(indent + 1);
    let result = `(${serializeSExpression(tag, indent + 1)}`;
    
    for (const child of children) {
      if (Array.isArray(child)) {
        result += `\n${childIndent}${serializeSExpression(child, indent + 1)}`;
      } else {
        result += ` ${serializeSExpression(child, indent + 1)}`;
      }
    }
    
    result += ')';
    return result;
  }
  return '';
}
