import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Calendar as CalendarIcon, Scale, TrendingDown, Activity, Ruler, Plus, Pencil, Trash2, ArrowDown, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WeightEntry {
  id: string;
  recorded_at: string;
  weight: number;
}

interface ProfileData {
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  height: number | null;
}

export default function AppProfile() {
  const { user, currentDay } = useAuth();
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Add weight modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [newDate, setNewDate] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Edit weight modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editDate, setEditDate] = useState<Date>(new Date());

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);

    // Fetch profile data with new fields
    const { data: profileRes } = await supabase
      .from('profiles')
      .select('start_date, current_weight, initial_weight, height')
      .eq('id', user.id)
      .single();

    if (profileRes) {
      setProfileData(profileRes);
    }

    // Fetch weight history
    const { data: weightData } = await supabase
      .from('weight_log')
      .select('id, recorded_at, weight')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: true });

    setWeightHistory(weightData || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const calculateBMI = (weight: number | null, height: number | null) => {
    if (!weight || !height || height === 0) return null;
    const heightInMeters = height / 100;
    return (weight / (heightInMeters * heightInMeters)).toFixed(1);
  };

  const weightDifference = profileData?.initial_weight && profileData?.current_weight
    ? (profileData.current_weight - profileData.initial_weight).toFixed(1)
    : null;

  const chartData = weightHistory.map((entry) => ({
    date: format(new Date(entry.recorded_at), 'dd/MM', { locale: he }),
    weight: entry.weight,
  }));

  // Calculate change from previous weight for each entry
  const getWeightChange = (index: number): { value: number; type: 'loss' | 'gain' | 'same' } | null => {
    if (index === 0) return null;
    const current = weightHistory[index].weight;
    const previous = weightHistory[index - 1].weight;
    const diff = current - previous;
    if (diff === 0) return { value: 0, type: 'same' };
    return { value: Math.abs(diff), type: diff < 0 ? 'loss' : 'gain' };
  };

  const handleAddWeight = async () => {
    if (!user || !newWeight) return;
    
    const weightValue = parseFloat(newWeight);
    if (isNaN(weightValue) || weightValue <= 0) {
      toast.error('נא להזין משקל תקין');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Add to weight_log
      const { error: logError } = await supabase
        .from('weight_log')
        .insert({
          user_id: user.id,
          weight: weightValue,
          recorded_at: format(newDate, 'yyyy-MM-dd'),
        });

      if (logError) throw logError;

      // Update current_weight in profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_weight: weightValue })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast.success('השקילה נוספה בהצלחה');
      setNewWeight('');
      setNewDate(new Date());
      setIsAddModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error adding weight:', error);
      toast.error('שגיאה בהוספת השקילה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditWeight = async () => {
    if (!editingEntry || !editWeight) return;
    
    const weightValue = parseFloat(editWeight);
    if (isNaN(weightValue) || weightValue <= 0) {
      toast.error('נא להזין משקל תקין');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('weight_log')
        .update({
          weight: weightValue,
          recorded_at: format(editDate, 'yyyy-MM-dd'),
        })
        .eq('id', editingEntry.id);

      if (error) throw error;

      // Update current_weight if this is the latest entry
      if (weightHistory.length > 0 && editingEntry.id === weightHistory[weightHistory.length - 1].id) {
        await supabase
          .from('profiles')
          .update({ current_weight: weightValue })
          .eq('id', user?.id);
      }

      toast.success('השקילה עודכנה בהצלחה');
      setEditingEntry(null);
      setIsEditModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error updating weight:', error);
      toast.error('שגיאה בעדכון השקילה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWeight = async (entry: WeightEntry) => {
    if (!confirm('האם למחוק את השקילה הזו?')) return;
    
    try {
      const { error } = await supabase
        .from('weight_log')
        .delete()
        .eq('id', entry.id);

      if (error) throw error;

      toast.success('השקילה נמחקה');
      fetchData();
    } catch (error) {
      console.error('Error deleting weight:', error);
      toast.error('שגיאה במחיקת השקילה');
    }
  };

  const openEditModal = (entry: WeightEntry) => {
    setEditingEntry(entry);
    setEditWeight(entry.weight.toString());
    setEditDate(new Date(entry.recorded_at));
    setIsEditModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-6">
      <div className="animate-slide-up flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">הפרופיל שלי</h2>
          <p className="text-muted-foreground">מעקב אחר ההתקדמות שלך</p>
        </div>
        
        {/* Add Weight Button */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 gradient-primary shadow-glow">
              <Plus className="h-4 w-4" />
              הוסף שקילה
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>הוספת שקילה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>משקל (ק"ג)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="לדוגמה: 75.5"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>תאריך</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-right">
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {format(newDate, 'dd/MM/yyyy', { locale: he })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newDate}
                      onSelect={(date) => date && setNewDate(date)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button 
                onClick={handleAddWeight} 
                className="w-full gradient-primary"
                disabled={isSubmitting || !newWeight}
              >
                {isSubmitting ? 'שומר...' : 'שמור שקילה'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <CalendarIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">תאריך התחלה</p>
                <p className="font-bold">
                  {profileData?.start_date
                    ? format(new Date(profileData.start_date), 'dd/MM/yyyy', { locale: he })
                    : 'לא נקבע'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">יום נוכחי</p>
                <p className="font-bold">יום {currentDay}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">משקל נוכחי</p>
                <p className="font-bold">
                  {profileData?.current_weight ? `${profileData.current_weight} ק"ג` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.25s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">משקל התחלתי</p>
                <p className="font-bold">
                  {profileData?.initial_weight ? `${profileData.initial_weight} ק"ג` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Weight Loss Card */}
        {weightDifference && (
          <Card 
            className={cn(
              "glass-card animate-slide-up col-span-2",
              Number(weightDifference) < 0 ? "bg-success/5 border-success/20" : ""
            )} 
            style={{ animationDelay: '0.3s' }}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    Number(weightDifference) < 0 ? "bg-success/10" : "bg-destructive/10"
                  )}>
                    {Number(weightDifference) < 0 ? (
                      <ArrowDown className="h-6 w-6 text-success" />
                    ) : (
                      <ArrowUp className="h-6 w-6 text-destructive" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">סה"כ שינוי במשקל</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      Number(weightDifference) < 0 ? "text-success" : "text-destructive"
                    )}>
                      {Number(weightDifference) > 0 ? '+' : ''}{weightDifference} ק"ג
                    </p>
                  </div>
                </div>
                {Number(weightDifference) < 0 && (
                  <span className="text-sm text-success font-medium">כל הכבוד! 🎉</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {profileData?.height && (
          <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.35s' }}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Ruler className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">גובה</p>
                  <p className="font-bold">{profileData.height} ס"מ</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {profileData?.height && profileData?.current_weight && (
          <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BMI</p>
                  <p className="font-bold">{calculateBMI(profileData.current_weight, profileData.height)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weight Progress Chart */}
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.45s' }}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            גרף התקדמות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    domain={['dataMin - 2', 'dataMax + 2']}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      direction: 'rtl',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`${value} ק"ג`, 'משקל']}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <p>עדיין אין נתוני שקילה. לחץ על "הוסף שקילה" כדי להתחיל.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weight History Table */}
      {weightHistory.length > 0 && (
        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              היסטוריית שקילות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">משקל</TableHead>
                    <TableHead className="text-right">שינוי</TableHead>
                    <TableHead className="text-right w-24">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...weightHistory].reverse().map((entry, reverseIndex) => {
                    const originalIndex = weightHistory.length - 1 - reverseIndex;
                    const change = getWeightChange(originalIndex);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.recorded_at), 'dd/MM/yyyy', { locale: he })}</TableCell>
                        <TableCell>{entry.weight} ק"ג</TableCell>
                        <TableCell>
                          {change ? (
                            <span className={cn(
                              "flex items-center gap-1",
                              change.type === 'loss' ? 'text-success' : change.type === 'gain' ? 'text-destructive' : 'text-muted-foreground'
                            )}>
                              {change.type === 'loss' && <ArrowDown className="h-4 w-4" />}
                              {change.type === 'gain' && <ArrowUp className="h-4 w-4" />}
                              {change.value === 0 ? '-' : `${change.value.toFixed(1)} ק"ג`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditModal(entry)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteWeight(entry)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Weight Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>עריכת שקילה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>משקל (ק"ג)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="לדוגמה: 75.5"
                value={editWeight}
                onChange={(e) => setEditWeight(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>תאריך</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-right">
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {format(editDate, 'dd/MM/yyyy', { locale: he })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={(date) => date && setEditDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button 
              onClick={handleEditWeight} 
              className="w-full gradient-primary"
              disabled={isSubmitting || !editWeight}
            >
              {isSubmitting ? 'שומר...' : 'עדכן שקילה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
