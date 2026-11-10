import { format } from 'date-fns';
import { Camera, Ruler } from 'lucide-react';
import { MEASURES } from '@/components/onboarding/BodySteps';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { MEASURE_COLUMN, useMeasurements } from '@/hooks/useMeasurements';
import { cn } from '@/lib/utils';

/** A trainee's circumference measurements (every one, with the change since the first) and body photos. */
export function BodyProgressSection({ userId }: { userId: string }) {
  const m = useMeasurements(userId);
  const rows = [...m.rows].reverse(); // newest first

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Ruler className="h-4 w-4 text-primary" />
          היקפים (ס"מ)
        </p>
        {m.isLoading ? null : rows.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">המתאמן עוד לא הוסיף היקפים</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2 text-right font-medium">תאריך</th>
                  {MEASURES.map((x) => <th key={x.key} className="px-2.5 py-2 text-right font-medium">{x.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2.5 py-2 text-muted-foreground">
                      {format(new Date(`${r.measured_at}T12:00:00`), 'dd/MM/yyyy')}
                      {i === rows.length - 1 && rows.length > 1 ? ' (התחלה)' : ''}
                    </td>
                    {MEASURES.map((x) => {
                      const v = r[MEASURE_COLUMN[x.key]] as number | null;
                      const start = m.first?.[MEASURE_COLUMN[x.key]] as number | null | undefined;
                      const diff = v != null && start != null && r.id !== m.first?.id ? +(Number(v) - Number(start)).toFixed(1) : null;
                      return (
                        <td key={x.key} className="whitespace-nowrap px-2.5 py-2 tabular-nums">
                          {v != null ? Number(v) : '—'}
                          {diff != null && diff !== 0 && (
                            <span className={cn('mr-1 text-xs', diff < 0 ? 'text-success' : 'text-muted-foreground')} dir="ltr">
                              ({diff > 0 ? '+' : ''}{diff})
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4 text-primary" />
          תמונות (שאלון הפתיחה והגלריה)
        </p>
        <PhotoGallery userId={userId} isAdmin />
      </div>
    </div>
  );
}
