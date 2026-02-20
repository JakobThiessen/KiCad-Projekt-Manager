/**
 * Selection System for the Schematic/PCB Editor
 * 
 * Manages which elements are currently selected.
 * Supports click-select, box-select, and multi-select.
 */

export interface Selectable {
  id: string;
  x: number;
  y: number;
  /** Bounding box for hit-testing */
  getBounds(): { minX: number; minY: number; maxX: number; maxY: number };
}

export class SelectionManager<T extends Selectable> {
  private selected = new Set<string>();
  private listeners: Array<() => void> = [];

  /** Get all selected element IDs */
  getSelectedIds(): string[] {
    return [...this.selected];
  }

  /** Check if an element is selected */
  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  /** Select a single element (clears previous selection unless additive) */
  select(id: string, additive = false): void {
    if (!additive) {
      this.selected.clear();
    }
    this.selected.add(id);
    this.notify();
  }

  /** Toggle selection of a single element */
  toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
    this.notify();
  }

  /** Select all elements within a rectangular region */
  selectInRect(elements: T[], rect: { minX: number; minY: number; maxX: number; maxY: number }, additive = false): void {
    if (!additive) {
      this.selected.clear();
    }

    for (const el of elements) {
      const bounds = el.getBounds();
      // Check if element bounds intersect with selection rect
      if (
        bounds.maxX >= rect.minX &&
        bounds.minX <= rect.maxX &&
        bounds.maxY >= rect.minY &&
        bounds.minY <= rect.maxY
      ) {
        this.selected.add(el.id);
      }
    }

    this.notify();
  }

  /** Clear selection */
  clear(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.notify();
  }

  /** Select all provided elements */
  selectAll(elements: T[]): void {
    this.selected.clear();
    for (const el of elements) {
      this.selected.add(el.id);
    }
    this.notify();
  }

  /** Number of selected elements */
  get count(): number {
    return this.selected.size;
  }

  /** Hit-test: find element at a point */
  hitTest(elements: T[], x: number, y: number, tolerance = 1): T | undefined {
    // Search in reverse (top-most first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const bounds = el.getBounds();
      if (
        x >= bounds.minX - tolerance &&
        x <= bounds.maxX + tolerance &&
        y >= bounds.minY - tolerance &&
        y <= bounds.maxY + tolerance
      ) {
        return el;
      }
    }
    return undefined;
  }

  /** Subscribe to selection changes */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
