"use client";

import { useAgencyStore } from "@/store/agency-store";
import { en } from "./locales/en";
import { ptBR } from "./locales/pt-BR";
import type { Translations } from "./locales/en";

export type Locale = "en" | "pt-BR";

const LOCALES: Record<Locale, Translations> = {
  en,
  "pt-BR": ptBR,
};

export function useTranslation() {
  const locale = useAgencyStore((s) => s.locale);
  const setLocale = useAgencyStore((s) => s.setLocale);
  const t = LOCALES[locale];
  return { t, locale, setLocale };
}
