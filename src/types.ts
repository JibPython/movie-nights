export type Media = { id: string; root: string; file: string; cover: string; title: string; genre: string; series: string; season: number | null; episode: number | null; order: number | null; size: number; addedAt: number; position: number; duration: number; watched: boolean; lastWatched: number | null; missing: boolean };
export type Settings = { theme: 'auto' | 'warm' | 'cinema'; cinemaStart: number; cinemaEnd: number; autoplay: boolean; shuffle: boolean; repeat: 'off' | 'one' | 'queue'; volume: number; speed: number; textScale: number };
export type Snapshot = { root: string; items: Media[]; queue: string[]; settings: Settings; playerReady: boolean };
export type Track = { id: number; type: 'audio' | 'sub' | 'video'; title?: string; lang?: string; selected?: boolean };
export type PlayerState = { position: number; duration: number; paused: boolean; volume: number; speed: number; tracks: Track[]; loading: boolean; muted?: boolean; subtitleDelay?: number };
export type SelectedFile = { token: string; name: string };
export interface DesktopAPI {
  snapshot(): Promise<Snapshot>; chooseRoot(): Promise<Snapshot>; scan(): Promise<Snapshot>;
  pick(kind: 'video' | 'cover' | 'subtitle'): Promise<SelectedFile | null>;
  importMovie(data: Record<string, unknown>): Promise<Snapshot>; cancelImport(): Promise<void>;
  edit(id: string, data: Record<string, unknown>): Promise<Snapshot>; markWatched(id: string, value: boolean): Promise<Snapshot>;
  settings(data: Partial<Settings>): Promise<Settings>; queue(ids: string[]): Promise<string[]>;
  play(id: string): Promise<Media>; stop(): Promise<Snapshot>; control(action: string, value?: number | string): Promise<void>;
  viewport(rect: { x: number; y: number; width: number; height: number } | null): Promise<void>;
  obscure(value: boolean): Promise<void>; fullscreen(value: boolean): Promise<void>; window(action: string): Promise<void>;
  on(event: string, handler: (data: any) => void): () => void;
}
declare global { interface Window { matinee?: DesktopAPI } }
