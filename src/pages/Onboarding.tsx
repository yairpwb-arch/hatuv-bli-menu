import { Navigate } from 'react-router-dom';
import { FullScreenLoader } from '@/components/BrandedLoader';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { Questionnaire } from '@/components/onboarding/Questionnaire';
import { IntroVideo } from '@/components/onboarding/IntroVideo';
import { PermissionsFlow } from '@/components/onboarding/PermissionsFlow';

const Spinner = FullScreenLoader;

/** New trainee: questionnaire → intro video → permissions → app. */
export default function Onboarding() {
  const { user, profile, isLoading, isAdmin } = useAuth();
  const { row, stage, introVideoUrl, save, advance } = useOnboarding(user?.id);

  if (isLoading) return <Spinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (!stage) return <Spinner />;
  if (stage === 'done') return <Navigate to="/app" replace />;

  if (stage === 'questionnaire') {
    return (
      <Questionnaire
        userId={user.id}
        initialName={profile?.full_name ?? ''}
        row={row}
        save={save}
        onDone={advance}
      />
    );
  }

  if (stage === 'video') {
    return (
      <IntroVideo
        url={introVideoUrl}
        onWatched={async () => {
          const watched = new Date().toISOString();
          await save({ intro_video_watched_at: watched });
          advance({ ...row!, intro_video_watched_at: watched });
        }}
      />
    );
  }

  return (
    <PermissionsFlow
      userId={user.id}
      initial={row?.permissions ?? {}}
      onSave={async (permissions, done) => {
        const patch = done
          ? { permissions, permissions_completed_at: new Date().toISOString() }
          : { permissions };
        await save(patch);
        if (done) advance({ ...row!, ...patch });
      }}
    />
  );
}
