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
    color: 'text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15',
  },
  {
    name: 'BookOpen',
    icon: BookOpen,
    color: 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15',
  },
  {
    name: 'CheckSquare',
    icon: CheckSquare,
    color: 'text-purple-500 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15',
  },
  {
    name: 'Activity',
    icon: Activity,
    color: 'text-fuchsia-500 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-500/15',
  },
  {
    name: 'Brain',
    icon: Brain,
    color: 'text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15',
  },
  {
    name: 'Compass',
    icon: Compass,
    color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15',
  },
  {
    name: 'Coffee',
    icon: Coffee,
    color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15',
  },
  {
    name: 'Flame',
    icon: Flame,
    color: 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15',
  },
  {
    name: 'Heart',
    icon: Heart,
    color: 'text-fuchsia-500 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-500/15',
  },
  {
    name: 'Star',
    icon: Star,
    color: 'text-purple-400 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/15',
  },
  {
    name: 'Moon',
    icon: Moon,
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15',
  },
  {
    name: 'Sun',
    icon: Sun,
    color: 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15',
  },
  {
    name: 'Dumbbell',
    icon: Dumbbell,
    color: 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15',
  },
  {
    name: 'Music',
    icon: Music,
    color: 'text-fuchsia-500 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-500/15',
  },
  {
    name: 'Pen',
    icon: Pen,
    color: 'text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15',
  },
  {
    name: 'Crosshair',
    icon: Crosshair,
    color: 'text-purple-500 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15',
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
