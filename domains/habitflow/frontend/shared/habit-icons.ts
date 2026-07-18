import {
  Droplet,
  BookOpen,
  CheckSquare,
  Activity,
  Brain,
  Compass,
  Coffee,
  Flame,
  Heart,
  Star,
  Moon,
  Sun,
  Dumbbell,
  Music,
  Pen,
  Crosshair,
} from 'lucide-react';

export const HABIT_ICONS = [
  {
    name: 'Droplet',
    icon: Droplet,
    color: 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15',
  },
  {
    name: 'BookOpen',
    icon: BookOpen,
    color: 'text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15',
  },
  {
    name: 'CheckSquare',
    icon: CheckSquare,
    color: 'text-purple-500 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15',
  },
  {
    name: 'Activity',
    icon: Activity,
    color: 'text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/15',
  },
  {
    name: 'Brain',
    icon: Brain,
    color: 'text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15',
  },
  {
    name: 'Compass',
    icon: Compass,
    color: 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15',
  },
  {
    name: 'Coffee',
    icon: Coffee,
    color: 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15',
  },
  {
    name: 'Flame',
    icon: Flame,
    color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/15',
  },
  {
    name: 'Heart',
    icon: Heart,
    color: 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/15',
  },
  {
    name: 'Star',
    icon: Star,
    color: 'text-pink-500 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/15',
  },
  {
    name: 'Moon',
    icon: Moon,
    color: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-500/15',
  },
  {
    name: 'Sun',
    icon: Sun,
    color: 'text-cyan-500 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/15',
  },
  {
    name: 'Dumbbell',
    icon: Dumbbell,
    color: 'text-teal-500 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/15',
  },
  {
    name: 'Music',
    icon: Music,
    color: 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15',
  },
  {
    name: 'Pen',
    icon: Pen,
    color: 'text-lime-600 dark:text-lime-400 bg-lime-50 dark:bg-lime-500/15',
  },
  {
    name: 'Crosshair',
    icon: Crosshair,
    color: 'text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-500/15',
  },
];

export function getIconComponent(name: string) {
  const found = HABIT_ICONS.find((i) => i.name === name);
  return found ? found.icon : Activity;
}

export function getIconColorClass(name: string) {
  const found = HABIT_ICONS.find((i) => i.name === name);
  return found ? found.color : 'text-gray-500 bg-gray-50';
}
