import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  start_date: string | null;
  current_weight: number | null;
  phone_number: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  currentDay: number;
  currentWeek: number;
  currentWeekForHabits: number;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

type AppRole = 'admin' | 'user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const currentDay = profile?.start_date
    ? Math.max(1, Math.floor((Date.now() - new Date(profile.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 1;

  // Calendar-week based (Sunday boundaries), capped by rolling 7-day week.
  // Prevents users who start late in the week from jumping to week 2 after only 1-2 days.
  const currentWeek = (() => {
    if (!profile?.start_date) return 1;
    const start = new Date(profile.start_date);
    const startSunday = new Date(start);
    startSunday.setDate(start.getDate() - start.getDay());
    startSunday.setHours(0, 0, 0, 0);
    const today = new Date();
    const todaySunday = new Date(today);
    todaySunday.setDate(today.getDate() - today.getDay());
    todaySunday.setHours(0, 0, 0, 0);
    const calendarWeek = Math.floor((todaySunday.getTime() - startSunday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const rollingWeek = Math.floor((currentDay - 1) / 7) + 1;
    return Math.max(1, Math.min(calendarWeek, rollingWeek));
  })();

  // Habits unlock on Sunday (day 2 of each program week), not Saturday (day 1).
  // formula: max(0, floor((currentDay - 2) / 7) + 1)
  // Day 1 (Sat) → 0 (no habits), Day 2 (Sun) → 1, Day 9 (Sun wk2) → 2, etc.
  const currentWeekForHabits = Math.max(0, Math.floor((currentDay - 2) / 7) + 1);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  };

  const checkAdminRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin' as AppRole)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking admin role:', error);
      return false;
    }
    return !!data;
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
      const adminStatus = await checkAdminRole(user.id);
      setIsAdmin(adminStatus);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let initialSessionChecked = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Use setTimeout to defer database calls and prevent deadlock
          setTimeout(async () => {
            if (!isMounted) return;
            const profileData = await fetchProfile(session.user.id);
            if (!isMounted) return;
            setProfile(profileData);
            const adminStatus = await checkAdminRole(session.user.id);
            if (!isMounted) return;
            setIsAdmin(adminStatus);
            // Only set loading to false after initial session check
            if (initialSessionChecked) {
              setIsLoading(false);
            }
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          // Only set loading to false after initial session check
          if (initialSessionChecked) {
            setIsLoading(false);
          }
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      
      initialSessionChecked = true;
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        try {
          const [profileData, adminStatus] = await Promise.all([
            fetchProfile(session.user.id),
            checkAdminRole(session.user.id)
          ]);
          if (!isMounted) return;
          setProfile(profileData);
          setIsAdmin(adminStatus);
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      isLoading,
      isAdmin,
      currentDay,
      currentWeek,
      currentWeekForHabits,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
