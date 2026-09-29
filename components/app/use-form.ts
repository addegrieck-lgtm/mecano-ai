"use client";

import { useState } from "react";
import type { z } from "zod";
import { fieldErrors } from "@/lib/validation/schemas";

/** Petit gestionnaire de formulaire : état, validation Zod côté client, erreurs par champ. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof T>(key: K, value: T[K]) => setValues((v) => ({ ...v, [key]: value }));
  const bind = (key: keyof T & string) => ({
    value: (values[key] ?? "") as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value as T[typeof key]),
    name: key,
    "aria-invalid": !!errors[key] || undefined,
  });
  const validate = <S extends z.ZodType>(schema: S): z.output<S> | null => {
    const r = schema.safeParse(values);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return null;
    }
    setErrors({});
    return r.data;
  };
  const reset = (next: T = initial) => {
    setValues(next);
    setErrors({});
  };
  return { values, setValues, set, bind, errors, setErrors, validate, reset };
}
