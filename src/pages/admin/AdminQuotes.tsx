import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';

interface Quote {
  id: string;
  day_number: number;
  message: string;
  description?: string | null;
}

export default function AdminQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filteredQuotes, setFilteredQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [formData, setFormData] = useState({ day_number: 1, message: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchQuotes();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredQuotes(
        quotes.filter(
          (q) =>
            q.day_number.toString().includes(query) ||
            q.message.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredQuotes(quotes);
    }
  }, [searchQuery, quotes]);

  const fetchQuotes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('daily_quotes')
      .select('*')
      .order('day_number', { ascending: true });

    if (error) {
      console.error('Error fetching quotes:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן לטעון ציטוטים', variant: 'destructive' });
    } else {
      setQuotes(data || []);
      setFilteredQuotes(data || []);
    }
    setIsLoading(false);
  };

  const openAddDialog = () => {
    const existingDays = new Set(quotes.map((q) => q.day_number));
    let nextDay = 1;
    while (existingDays.has(nextDay) && nextDay <= 168) {
      nextDay++;
    }
    
    setEditingQuote(null);
    setFormData({ day_number: nextDay, message: '' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (quote: Quote) => {
    setEditingQuote(quote);
    setFormData({ day_number: quote.day_number, message: quote.message, description: quote.description || '' });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.message || formData.day_number < 1 || formData.day_number > 168) {
      toast({ title: 'שגיאה', description: 'אנא מלא את כל השדות בצורה תקינה', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    if (editingQuote) {
      const { error } = await supabase
        .from('daily_quotes')
        .update({ day_number: formData.day_number, message: formData.message, description: formData.description || null })
        .eq('id', editingQuote.id);

      if (error) {
        toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'הצלחה', description: 'הציטוט עודכן בהצלחה' });
        setIsDialogOpen(false);
        fetchQuotes();
      }
    } else {
      const { error } = await supabase.from('daily_quotes').insert({
        day_number: formData.day_number,
        message: formData.message,
        description: formData.description || null,
      });

      if (error) {
        if (error.message.includes('duplicate')) {
          toast({ title: 'שגיאה', description: 'כבר קיים ציטוט ליום זה', variant: 'destructive' });
        } else {
          toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
        }
      } else {
        toast({ title: 'הצלחה', description: 'הציטוט נוסף בהצלחה' });
        setIsDialogOpen(false);
        fetchQuotes();
      }
    }

    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק ציטוט זה?')) return;

    const { error } = await supabase.from('daily_quotes').delete().eq('id', id);

    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק את הציטוט', variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'הציטוט נמחק בהצלחה' });
      fetchQuotes();
    }
  };

  const missingDaysCount = 168 - quotes.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">ניהול ציטוטים יומיים</h2>
          <p className="text-muted-foreground">
            {quotes.length}/168 ציטוטים
            {missingDaysCount > 0 && (
              <span className="text-warning mr-2">({missingDaysCount} חסרים)</span>
            )}
          </p>
        </div>

        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף ציטוט
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש לפי יום או טקסט..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="text-right w-16">יום</TableHead>
                    <TableHead className="text-right">משפט</TableHead>
                    <TableHead className="text-right hidden md:table-cell">הסבר</TableHead>
                    <TableHead className="text-right w-20">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-bold text-primary">{quote.day_number}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{quote.message}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground hidden md:table-cell">
                        {quote.description || <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(quote)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(quote.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingQuote ? 'עריכת ציטוט' : 'הוספת ציטוט חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">מספר יום (1-168)</label>
              <Input
                type="number"
                min="1"
                max="168"
                value={formData.day_number}
                onChange={(e) => setFormData({ ...formData, day_number: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">משפט (כולל שם המחבר)</label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="הזן את המשפט היומי..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">הסבר <span className="text-muted-foreground font-normal">(אופציונלי)</span></label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="הזן הסבר / פרשנות לציטוט..."
                rows={3}
              />
            </div>
            <Button onClick={handleSubmit} className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {editingQuote ? 'שמור שינויים' : 'הוסף ציטוט'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
