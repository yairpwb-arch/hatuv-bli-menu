import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Calendar, Loader2 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  height: number | null;
  is_active: boolean;
  created_at: string;
}

const ADMIN_EMAIL = 'yairpwb@gmail.com';

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    startDate: '',
    height: '',
    initialWeight: '',
  });

  const [editData, setEditData] = useState({
    startDate: '',
    isActive: true,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('email', ADMIN_EMAIL) // Exclude admin from users list
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן לטעון משתמשים', variant: 'destructive' });
    } else {
      setUsers(data || []);
    }
    setIsLoading(false);
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password) {
      toast({ title: 'שגיאה', description: 'אנא מלא את כל השדות', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    // Create user via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newUser.email,
      password: newUser.password,
      options: {
        data: { full_name: newUser.fullName },
      },
    });

    if (authError) {
      toast({ title: 'שגיאה', description: authError.message, variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }

    // Update profile with all fields
    if (authData.user) {
      const updateData: Record<string, unknown> = {};
      if (newUser.startDate) updateData.start_date = newUser.startDate;
      if (newUser.height) updateData.height = parseFloat(newUser.height);
      if (newUser.initialWeight) {
        updateData.initial_weight = parseFloat(newUser.initialWeight);
        updateData.current_weight = parseFloat(newUser.initialWeight);
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', authData.user.id);
      }
    }

    toast({ title: 'הצלחה', description: 'המשתמש נוסף בהצלחה' });
    setNewUser({ email: '', password: '', fullName: '', startDate: '', height: '', initialWeight: '' });
    setIsAddOpen(false);
    setIsSubmitting(false);
    fetchUsers();
  };

  const handleEditUser = async () => {
    if (!editingUser) return;

    setIsSubmitting(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        start_date: editData.startDate || null,
        is_active: editData.isActive,
      })
      .eq('id', editingUser.id);

    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן לעדכן את המשתמש', variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'המשתמש עודכן בהצלחה' });
      setEditingUser(null);
      fetchUsers();
    }
    setIsSubmitting(false);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setEditData({
      startDate: user.start_date || '',
      isActive: user.is_active,
    });
  };

  const calculateCurrentDay = (startDate: string | null) => {
    if (!startDate) return '-';
    const days = differenceInDays(new Date(), new Date(startDate)) + 1;
    return days > 0 ? days : '-';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">ניהול משתמשים</h2>
          <p className="text-muted-foreground">צפה ונהל את כל המשתמשים בתוכנית</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              הוסף משתמש
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>הוספת משתמש חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>שם מלא</Label>
                <Input
                  value={newUser.fullName}
                  onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                  placeholder="ישראל ישראלי"
                />
              </div>
              <div className="space-y-2">
                <Label>אימייל</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="email@example.com"
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>סיסמה זמנית</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="••••••••"
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>תאריך התחלה</Label>
                <Input
                  type="date"
                  value={newUser.startDate}
                  onChange={(e) => setNewUser({ ...newUser, startDate: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>גובה (ס"מ)</Label>
                  <Input
                    type="number"
                    value={newUser.height}
                    onChange={(e) => setNewUser({ ...newUser, height: e.target.value })}
                    placeholder="170"
                    dir="ltr"
                    className="text-left"
                  />
                </div>
                <div className="space-y-2">
                  <Label>משקל התחלתי (ק"ג)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={newUser.initialWeight}
                    onChange={(e) => setNewUser({ ...newUser, initialWeight: e.target.value })}
                    placeholder="75.5"
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              </div>
              <Button onClick={handleAddUser} className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                הוסף משתמש
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right">אימייל</TableHead>
                  <TableHead className="text-right">תאריך התחלה</TableHead>
                  <TableHead className="text-right">יום נוכחי</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name || '-'}</TableCell>
                    <TableCell dir="ltr" className="text-left">{user.email}</TableCell>
                    <TableCell>
                      {user.start_date
                        ? format(new Date(user.start_date), 'dd/MM/yyyy', { locale: he })
                        : '-'}
                    </TableCell>
                    <TableCell>{calculateCurrentDay(user.start_date)}</TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active ? 'פעיל' : 'לא פעיל'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת משתמש: {editingUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>תאריך התחלה</Label>
              <Input
                type="date"
                value={editData.startDate}
                onChange={(e) => setEditData({ ...editData, startDate: e.target.value })}
                dir="ltr"
                className="text-left"
              />
              <p className="text-xs text-muted-foreground">
                שינוי התאריך ישנה את היום הנוכחי של המשתמש בתוכנית
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={editData.isActive}
                onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="isActive">משתמש פעיל</Label>
            </div>
            <Button onClick={handleEditUser} className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              שמור שינויים
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}