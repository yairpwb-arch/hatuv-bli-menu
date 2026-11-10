import { useCallback, useEffect, useState } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { MeasureKey } from '@/components/onboarding/BodySteps';

// body_measurements isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface MeasurementRow {
  id: string;
  measured_at: string;
  arm_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  belly_cm: number | null;
}

export type MeasureValues = Partial<Record<MeasureKey, number>>;

export const MEASURE_COLUMN: Record<MeasureKey, keyof MeasurementRow> = {
  arm: 'arm_cm',
  chest: 'chest_cm',
  waist: 'waist_cm',
  belly: 'belly_cm',
};

export const valuesOf = (r: MeasurementRow | null | undefined): MeasureValues => {
  if (!r) return {};
  const v: MeasureValues = {};
  (Object.keys(MEASURE_COLUMN) as MeasureKey[]).forEach((k) => {
    const n = r[MEASURE_COLUMN[k]];
    if (n != null) v[k] = Number(n);
  });
  return v;
};

/** Measurements are asked for again every two months. */
export const MEASURE_EVERY_DAYS = 56;

/** Due again: never measured, or the last one is two months old. */
export const isMeasureDue = (lastYmd: string | null | undefined) =>
  !lastYmd || differenceInCalendarDays(new Date(), new Date(`${lastYmd}T12:00:00`)) >= MEASURE_EVERY_DAYS;

/** yyyy-MM-dd of the next measurement after one taken on lastYmd. */
export const nextMeasureDay = (lastYmd: string) => format(addDays(new Date(`${lastYmd}T12:00:00`), MEASURE_EVERY_DAYS), 'yyyy-MM-dd');

/** Saves today's measurements (a second time today replaces the first). */
export async function saveMeasurements(userId: string, values: MeasureValues): Promise<boolean> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const cols = {
    arm_cm: values.arm ?? null,
    chest_cm: values.chest ?? null,
    waist_cm: values.waist ?? null,
    belly_cm: values.belly ?? null,
  };
  const { data: todays } = await db.from('body_measurements').select('id').eq('user_id', userId).eq('measured_at', today).limit(1);
  const { error } = todays?.[0]
    ? await db.from('body_measurements').update(cols).eq('id', todays[0].id)
    : await db.from('body_measurements').insert({ user_id: userId, measured_at: today, ...cols });
  return !error;
}

/** A trainee's circumference measurements, oldest first; saving today's replaces today's. */
export function useMeasurements(userId: string | undefined) {
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await db
      .from('body_measurements')
      .select('id, measured_at, arm_cm, chest_cm, waist_cm, belly_cm')
      .eq('user_id', userId)
      .order('measured_at', { ascending: true })
      .order('created_at', { ascending: true });
    setRows((data ?? []) as MeasurementRow[]);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (values: MeasureValues): Promise<boolean> => {
    if (!userId || !(await saveMeasurements(userId, values))) return false;
    await load();
    return true;
  };

  return { rows, latest: rows[rows.length - 1] ?? null, first: rows[0] ?? null, isLoading, save, reload: load };
}
