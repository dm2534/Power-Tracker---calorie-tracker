import { UserProfile, FoodLog } from '../types';

// Mocking Supabase with localStorage for the SPA environment
const USER_KEY = 'soul_feast_user';
const LOGS_KEY = 'soul_feast_logs';

export const db = {
  getUser: (): UserProfile | null => {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  },
  
  saveUser: (profile: UserProfile): void => {
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

  addLog: (log: FoodLog): void => {
    const logs = db.getLogs();
    logs.unshift(log); // Add to beginning
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  },

  deleteLog: (id: string): void => {
    const logs = db.getLogs();
    const filtered = logs.filter(l => l.id !== id);
    localStorage.setItem(LOGS_KEY, JSON.stringify(filtered));
  },

  getTodayLogs: (): FoodLog[] => {
    const logs = db.getLogs();
    const today = new Date().toISOString().split('T')[0];
    return logs.filter(l => l.loggedAt.startsWith(today));
  }
};
