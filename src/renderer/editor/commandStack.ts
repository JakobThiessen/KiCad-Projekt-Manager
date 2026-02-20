/**
 * Command Pattern for Editor Undo/Redo System
 * 
 * Each editing operation is encapsulated as a Command object that can be
 * executed, undone, and redone. Commands are stored in a stack.
 */

export interface EditorCommand {
  /** Human-readable description of the command */
  readonly description: string;
  /** Execute the command (do or redo) */
  execute(): void;
  /** Undo the command */
  undo(): void;
}

export class CommandStack {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private maxHistory = 100;
  private listeners: Array<() => void> = [];

  /** Execute a command and push it to the undo stack */
  execute(command: EditorCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack on new command

    // Limit history size
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.notifyListeners();
  }

  /** Undo the last command */
  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    command.undo();
    this.redoStack.push(command);
    this.notifyListeners();
    return true;
  }

  /** Redo the last undone command */
  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    command.execute();
    this.undoStack.push(command);
    this.notifyListeners();
    return true;
  }

  /** Check if undo is available */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Check if redo is available */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Get the description of the next undo operation */
  getUndoDescription(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.description;
  }

  /** Get the description of the next redo operation */
  getRedoDescription(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.description;
  }

  /** Clear all history */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  /** Subscribe to stack changes */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// --- Concrete Commands ---

/** Move one or more elements to a new position */
export class MoveElementsCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private elements: Array<{ id: string; getPos: () => { x: number; y: number }; setPos: (x: number, y: number) => void }>,
    private deltaX: number,
    private deltaY: number,
  ) {
    this.description = `Move ${elements.length} element(s)`;
  }

  execute(): void {
    for (const el of this.elements) {
      const pos = el.getPos();
      el.setPos(pos.x + this.deltaX, pos.y + this.deltaY);
    }
  }

  undo(): void {
    for (const el of this.elements) {
      const pos = el.getPos();
      el.setPos(pos.x - this.deltaX, pos.y - this.deltaY);
    }
  }
}

/** Delete elements */
export class DeleteElementsCommand implements EditorCommand {
  readonly description: string;
  private removedElements: any[] = [];

  constructor(
    private collection: any[],
    private elementIds: string[],
    private getIdFn: (el: any) => string,
  ) {
    this.description = `Delete ${elementIds.length} element(s)`;
  }

  execute(): void {
    this.removedElements = [];
    for (let i = this.collection.length - 1; i >= 0; i--) {
      const id = this.getIdFn(this.collection[i]);
      if (this.elementIds.includes(id)) {
        this.removedElements.push({ index: i, element: this.collection[i] });
        this.collection.splice(i, 1);
      }
    }
  }

  undo(): void {
    // Re-insert in reverse order to preserve indices
    for (const { index, element } of this.removedElements.reverse()) {
      this.collection.splice(index, 0, element);
    }
    this.removedElements = [];
  }
}

/** Change a property value */
export class ChangePropertyCommand implements EditorCommand {
  readonly description: string;
  private oldValue: any;

  constructor(
    private target: any,
    private property: string,
    private newValue: any,
  ) {
    this.description = `Change ${property}`;
    this.oldValue = target[property];
  }

  execute(): void {
    this.target[this.property] = this.newValue;
  }

  undo(): void {
    this.target[this.property] = this.oldValue;
  }
}

/** Batch multiple commands into one undoable operation */
export class BatchCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private commands: EditorCommand[],
    description?: string,
  ) {
    this.description = description ?? `Batch (${commands.length} operations)`;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
