import { z } from "zod";

export const clientSchema = z.object({
  name: z.string().min(2, "Nazwa jest wymagana"),
  note: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
});

export const projectSchema = z.object({
  name: z.string().min(2),
  clientId: z.string().min(1),
  billingType: z.enum(["FIXED", "HOURLY", "MONTHLY_RETAINER"]),
  cadence: z.enum(["ONE_OFF", "RECURRING_MONTHLY"]),
  status: z.enum(["ACTIVE", "PAUSED", "DONE"]),
  tags: z.array(z.string()).default([]),
  monthlyRetainerAmount: z.coerce.number().optional().nullable(),
  fixedClientPrice: z.coerce.number().optional().nullable(),
  hourlyClientRate: z.coerce.number().optional().nullable(),
  contractStart: z.string().optional().nullable(),
  contractEnd: z.string().optional().nullable(),
  deadlineAt: z.string().optional().nullable(),
});

export const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  hourlyRateDefault: z.coerce.number().min(0),
  password: z.string().min(6).optional(),
  availability: z.enum(["AVAILABLE", "VACATION", "SICK"]).optional(),
});

export const assignmentSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  hourlyRateOverride: z.coerce.number().optional().nullable(),
  fixedPayoutAmount: z.coerce.number().optional().nullable(),
});

export const timeEntryCreateSchema = z.object({
  projectId: z.string().min(1),
  date: z.string().min(1),
  hours: z.coerce.number().min(0.25).max(24),
  note: z.string().optional().nullable(),
});

export const bonusSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  amount: z.coerce.number().min(0),
  type: z.enum(["ONE_OFF", "MONTHLY"]),
  month: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const goalSchema = z.object({
  userId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  targetHours: z.coerce.number().min(0),
  targetRevenue: z.coerce.number().optional().nullable(),
  bonusAmount: z.coerce.number().optional().nullable(),
});

// Auth
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
