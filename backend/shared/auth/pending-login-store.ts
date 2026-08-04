export interface PendingLoginStore {
  readPassword(): Promise<string | null>;
  setPassword(password: string): Promise<void>;
  clear(): Promise<void>;
}
