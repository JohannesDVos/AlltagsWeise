export interface TodoInput {
  title: string;
  note: string;
  dueOn: string | null;
}

export interface Todo extends TodoInput {
  id: string;
  completed: boolean;
}

export type Rhythm = 'daily' | 'weekly' | 'monthly';
export interface RoutineInput {
  title: string;
  rhythm: Rhythm;
  day: number | null;
}

export interface Routine extends RoutineInput {
  id: string;
  nextDueOn: string | null;
  dueToday: boolean;
  completedToday: boolean;
  currentStreak: number;
  bestStreak: number;
  archivedOn: string | null;
  completions: string[];
}

export interface DatedList<T> {
  today: string;
  items: T[];
}

export const rhythmNames: Record<Rhythm, string> = {
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
};

export const weekdayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
