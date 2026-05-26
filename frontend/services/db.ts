import { UserProfile, FoodLog } from '../types';

const USER_KEY = 'soul_feast_user';
const LOGS_KEY = 'soul_feast_logs';

const storage = {
  getUser: (): UserProfile | null => {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  },
  setUser: (profile: UserProfile): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
  },
  clearUser: (): void => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LOGS_KEY);
  },
  getLogs: (): FoodLog[] => {
    const data = localStorage.getItem(LOGS_KEY);
    return data ? JSON.parse(data) : [];
  },
  setLogs: (logs: FoodLog[]): void => {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  },
};

async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed: ${response.status}`);
  }
  return response.json();
}

export const db = {
  getUser: (): UserProfile | null => storage.getUser(),
  async fetchUser(id?: string): Promise<UserProfile | null> {
    if (!id) return null;
    const user = await apiFetch<UserProfile>(`/api/user?id=${encodeURIComponent(id)}`);
    storage.setUser(user);
    return user;
  },
  async saveUser(profile: UserProfile): Promise<UserProfile> {
    const saved = await apiFetch<UserProfile>('/api/user', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    storage.setUser(saved);
    return saved;
  },
  clearUser: (): void => storage.clearUser(),
  getLogs: (): FoodLog[] => storage.getLogs(),
  async fetchLogs(userId?: string): Promise<FoodLog[]> {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const logs = await apiFetch<FoodLog[]>(`/api/logs${query}`);
    storage.setLogs(logs);
    return logs;
  },
  async addLog(log: FoodLog): Promise<FoodLog> {
    const saved = await apiFetch<FoodLog>('/api/logs', {
      method: 'POST',
      body: JSON.stringify(log),
    });
    const logs = [saved, ...storage.getLogs().filter((l) => l.id !== saved.id)];
    storage.setLogs(logs);
    return saved;
  },
  async deleteLog(id: string): Promise<void> {
    await apiFetch(`/api/logs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const filtered = storage.getLogs().filter((l) => l.id !== id);
    storage.setLogs(filtered);
  },
  getTodayLogs: (): FoodLog[] => {
    const logs = storage.getLogs();
    const today = new Date().toISOString().split('T')[0];
    return logs.filter((l) => l.loggedAt.startsWith(today));
  },
};
