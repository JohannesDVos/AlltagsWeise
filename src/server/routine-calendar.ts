import type { RoutineInput } from '../shared/personal.js';

const dayMs = 86400000;
const berlin = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const berlinDay = (time: number) => berlin.format(time);
const utcDay = (date: string) => Date.parse(date + 'T00:00:00Z') / dayMs;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

export function validDay(date: string) {
  const time = utcDay(date) * dayMs;
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time) && iso(time) === date;
}

function period(routine: RoutineInput, date: string) {
  if (routine.rhythm === 'daily') return utcDay(date);
  // Epoch Thursday belongs to the week that starts three days earlier.
  if (routine.rhythm === 'weekly') return Math.floor((utcDay(date) + 3) / 7);
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function dueInPeriod(routine: RoutineInput, index: number) {
  if (routine.rhythm === 'daily') return iso(index * dayMs);
  if (routine.rhythm === 'weekly') return iso((index * 7 - 3 + (routine.day ?? 1) - 1) * dayMs);
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(Date.UTC(year, month, Math.min(routine.day ?? last, last)));
}

export function nextDue(routine: RoutineInput, from: string) {
  const index = period(routine, from);
  const due = dueInPeriod(routine, index);
  return due >= from ? due : dueInPeriod(routine, index + 1);
}

export function streaks(routine: RoutineInput, through: string, dates: string[]) {
  const index = period(routine, through);
  const due = dueInPeriod(routine, index);
  const lastRequired = due >= through ? index - 1 : index;
  let previous = -Infinity;
  let run = 0;
  let bestStreak = 0;
  for (const date of dates) {
    if (date > through) break;
    const current = period(routine, date);
    run = current === previous + 1 ? run + 1 : 1;
    previous = current;
    bestStreak = Math.max(bestStreak, run);
  }
  return {currentStreak: previous >= lastRequired ? run : 0, bestStreak};
}
