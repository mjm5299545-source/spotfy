export interface QueryStatement {
  get(...params: any[]): any | Promise<any>;
  all(...params: any[]): any[] | Promise<any[]>;
  run(...params: any[]): { changes: number | bigint } | Promise<{ changes: number | bigint }>;
}

export interface AppDatabase {
  prepare(sql: string): QueryStatement;
  exec(sql: string): void | Promise<void>;
  close(): void | Promise<void>;
  transaction?<T>(work: () => T | Promise<T>): Promise<T>;
}
