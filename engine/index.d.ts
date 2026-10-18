// Type declarations for the JavaScript rendering engine.

export type LinkTarget = {page: string; sub: string | null; alias: string | null};

export type Run =
  | {
      type: 'text';
      text: string;
      bold?: boolean;
      italic?: boolean;
      strike?: boolean;
      code?: boolean;
      mark?: boolean;
      href?: string;
      link?: LinkTarget;
    }
  | {type: 'math'; tex: string; display?: boolean}
  | {type: 'tag'; tag: string}
  | {type: 'fnref'; n: number; label: string}
  | {type: 'embed'; target: LinkTarget; md?: boolean}
  | {type: 'break'};

export type ListItem = {children: Block[]; task?: boolean; taskChar?: string; line?: number};

export type Property = {key: string; value: string | string[]};

type BlockBase = {line?: number; id?: string};

export type Block = BlockBase &
  (
    | {type: 'heading'; level: number; runs: Run[]; anchor: string}
    | {type: 'paragraph'; runs: Run[]}
    | {type: 'math'; tex: string}
    | {type: 'code'; lang: string; text: string}
    | {type: 'hr'}
    | {type: 'quote'; children: Block[]}
    | {type: 'callout'; kind: string; /** text after "|" in [!kind|meta] */ meta: string; fold: '' | '+' | '-'; title: Run[] | null; children: Block[]}
    | {type: 'list'; ordered: boolean; start: number; items: ListItem[]}
    | {type: 'table'; header: Run[][]; rows: Run[][][]; align: string[]}
    | {type: 'properties'; props: Property[]}
    | {type: 'embed'; target: LinkTarget; md?: boolean}
    | {type: 'footnotes'; items: {n: number; label: string; children: Block[]}[]}
  );

export type VaultEntry = {
  path: string;
  rel: string;
  name: string;
  title: string;
  isNote: boolean;
  isImage: boolean;
  modified: number;
  size: number;
};

export type VaultIndex = {
  root: string;
  notes: VaultEntry[];
  attachments: VaultEntry[];
  byPath: Map<string, VaultEntry>;
};

export type PreviewImage = {
  ok: boolean;
  uri?: string;
  /** true: an alpha mask, draw it with tintColor = the text color. */
  tint?: boolean;
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
export function collectEmbeds(blocks: Block[]): (Block & {type: 'embed'})[];
export function collectLinks(blocks: Block[]): {links: LinkTarget[]; tags: string[]};
export function extractSection(blocks: Block[], sub: string | null): Block[] | null;
export function findHeading(blocks: Block[], text: string): number;
export function normAnchor(s: string): string;
export function plainText(runs: Run[]): string;
export function parseLinkTarget(inner: string): LinkTarget;
export function linkLabel(t: LinkTarget): string;
export function buildIndex(files: {path: string; rel: string; name?: string; modified?: number; size?: number}[], root: string): VaultIndex;
export function resolveLink(index: VaultIndex | null, page: string, fromPath?: string | null): VaultEntry | null;
export function newNotePath(index: VaultIndex, page: string): string;
export function searchNotes(index: VaultIndex, query: string, limit?: number): VaultEntry[];
export function collectMath(blocks: Block[]): {tex: string; display: boolean}[];
export function mathAtOffset(src: string, offset: number): {tex: string; display: boolean; start: number; end: number} | null;
export function stripDelimiters(text: string): string;
export function definesMacros(tex: string): boolean;
export function toBase64(bytes: Uint8Array): string;
