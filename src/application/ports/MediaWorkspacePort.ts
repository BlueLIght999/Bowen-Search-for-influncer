export interface MediaWorkspace {
  audioPath: string;
  frameDirectory: string;
  framePattern: string;
  everySeconds: number;
}

export interface MediaWorkspacePort {
  prepare(assetId: string): Promise<MediaWorkspace>;
}
