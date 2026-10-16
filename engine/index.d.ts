// Type declarations for the JavaScript rendering engine.

export type Run =
  | {type: 'text'; text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean; href?: string}
  | {type: 'math'; tex: string; display?: boolean}
  | {type: 'break'};

export type ListItem = {children: Block[]; task?: boolean};

export type Block =
  | {type: 'heading'; level: number; runs: Run[]; line?: number}
  | {type: 'paragraph'; runs: Run[]; line?: number}
  | {type: 'math'; tex: string; line?: number}
  | {type: 'code'; lang: string; text: string; line?: number}
  | {type: 'hr'; line?: number}
  | {type: 'quote'; children: Block[]; line?: number}
  | {type: 'list'; ordered: boolean; start: number; items: ListItem[]; line?: number}
  | {type: 'table'; header: Run[][]; rows: Run[][][]; align: string[]; line?: number};

export type PreviewImage = {
  ok: boolean;
  uri?: string;
  width: number;
  height: number;
  ascent: number;
  error?: string;
  unsupportedText?: boolean;
};

export type NoteImage = {
  ok: boolean;
  png?: Uint8Array;
  base64?: string;
  width: number;
  height: number;
  error?: string;
  unsupportedText?: boolean;
};

export class MathSession {
  constructor();
  setContext(blocks: Block[], preamble: string): boolean;
  preview(tex: string, display: boolean, emPx: number): PreviewImage;
  hasPreview(tex: string, display: boolean, emPx: number): boolean;
  forNote(tex: string, display: boolean, emPx: number, dpi?: number): NoteImage;
}

export function parseMarkdown(src: string): Block[];
export function collectMath(blocks: Block[]): {tex: string; display: boolean}[];
export function mathAtOffset(src: string, offset: number): {tex: string; display: boolean; start: number; end: number} | null;
export function stripDelimiters(text: string): string;
export function definesMacros(tex: string): boolean;
export function toBase64(bytes: Uint8Array): string;
