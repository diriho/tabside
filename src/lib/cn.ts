import { twMerge } from 'tailwind-merge'

type ClassValue = string | false | null | undefined | 0

/** Joins class names; later Tailwind utilities override conflicting earlier ones (w-36 beats w-full). */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
}
