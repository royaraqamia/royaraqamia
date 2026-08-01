import { z } from 'zod';

export const createHabitSchema = z.object({
  name: z.string().min(1, 'اسم العادة مطلوب').trim(),
  icon: z.string().default('Activity'),
  frequency: z.enum(['daily', 'weekly']).default('daily'),
});

export const updateHabitSchema = z.object({
  id: z.string().min(1, 'معرّف العادة مطلوب'),
  name: z.string().min(1, 'اسم العادة مطلوب').trim(),
  icon: z.string().optional(),
  frequency: z.enum(['daily', 'weekly']).optional(),
});

export const toggleLogSchema = z.object({
  habitId: z.string().min(1, 'معرّف العادة مطلوب'),
  date: z
    .string()
    .min(1, 'التاريخ مطلوب')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صالحة'),
  completed: z.boolean(),
});
