/** Everything the command line needs from the outside world, so it can be tested without a process. */
export interface CliIo {
  /** The directory that holds `data/` and `public/`. */
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Normal output. */
  readonly out: (line: string) => void;
  /** Warnings and errors. */
  readonly err: (line: string) => void;
}
