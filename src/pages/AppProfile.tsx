import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useStreak } from '@/hooks/useStreak';

import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { StatsGrid } from '@/components/profile/StatsGrid';
import { WeighInCard } from '@/components/profile/WeighInCard';
import { WeightChart } from '@/components/profile/WeightChart';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { EditProfileModal } from '@/components/profile/EditProfileModal';

interface ProfileData {
  full_name: string | null;
  avatar_url: string | null;
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  target_weight: number | null;
  height: number | null;
  birthdate: string | null;
  gender: string | null;
}

interface WeightEntry {
  id: string;
  recorded_at: string;
  weight: number;
}

export default function AppProfile() {
  const { user, currentDay } = useAuth();
  const currentWeek = Math.ceil(currentDay / 7);
  const { currentStreak } = useStreak(user?.id, currentWeek);
  
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [lessonsCompleted, setLessonsCompleted] = useState(0);
  const [totalLessons, setTotalLessons] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);

    const [profileRes, weightRes, lessonsRes, progressRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, avatar_url, start_date, current_weight, initial_weight, target_weight, height, birthdate, gender')
        .eq('id', user.id)
        .single(),
      supabase
        .from('weight_log')
        .select('id, recorded_at, weight')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('program_content')
        .select('id', { count: 'exact' }),
      supabase
        .from('content_progress')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id),
    ]);

    if (profileRes.data) setProfileData(profileRes.data);
    setWeightHistory(weightRes.data || []);
    setTotalLessons(lessonsRes.count || 0);
    setLessonsCompleted(progressRes.count || 0);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleAvatarUpdate = (url: string) => {
    if (profileData) {
      setProfileData({ ...profileData, avatar_url: url });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-5">
      {/* Header */}
      <ProfileHeader
        userId={user?.id || ''}
        fullName={profileData?.full_name || null}
        avatarUrl={profileData?.avatar_url || null}
        startDate={profileData?.start_date || null}
        currentDay={currentDay}
        currentStreak={currentStreak}
        onAvatarUpdate={handleAvatarUpdate}
        onEdit={() => setIsEditOpen(true)}
      />

      {/* Stats Grid */}
      <StatsGrid
        currentWeight={profileData?.current_weight || null}
        initialWeight={profileData?.initial_weight || null}
        targetWeight={profileData?.target_weight || null}
        height={profileData?.height || null}
        currentDay={currentDay}
        totalStreak={currentStreak}
        lessonsCompleted={lessonsCompleted}
        totalLessons={totalLessons}
        gender={profileData?.gender || null}
      />

      {/* Friday Weigh-In Card */}
      {user && (
        <WeighInCard
          userId={user.id}
          currentWeight={profileData?.current_weight || null}
          onWeightAdded={fetchData}
        />
      )}

      {/* Weight Progress Chart */}
      <WeightChart
        weightHistory={weightHistory}
        targetWeight={profileData?.target_weight || null}
      />

      {/* Photo Gallery */}
      {user && <PhotoGallery userId={user.id} />}

      {/* Edit Profile Modal */}
      <EditProfileModal
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        userId={user?.id || ''}
        initialData={{
          full_name: profileData?.full_name || null,
          height: profileData?.height || null,
          target_weight: profileData?.target_weight || null,
          birthdate: profileData?.birthdate || null,
          gender: profileData?.gender || null,
        }}
        onUpdate={fetchData}
      />
    </div>
  );
}
