export type Config = {
  repository: string;
  model: string;
  provider: string;
  openhandsWorkspace: string;
  maxIterations: number;
  environment: Record<string, string>;
};
