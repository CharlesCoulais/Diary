import { z } from 'zod';

export const emailSchema = z
  .string()
  .email('Email invalide')
  .max(254)
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(12, 'Mot de passe trop court (12 caractères minimum)')
  .max(256, 'Mot de passe trop long');

export const displayNameSchema = z
  .string()
  .min(1)
  .max(80)
  .trim()
  .optional();

export const registerInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis').max(256),
});

export type RegisterInput = z.infer<typeof registerInput>;
export type LoginInput = z.infer<typeof loginInput>;
