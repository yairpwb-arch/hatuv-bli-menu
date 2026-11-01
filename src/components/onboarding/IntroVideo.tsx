import { useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { PrimaryButton } from '@/components/ds';
import { successHaptic } from '@/lib/native';
import { OnboardingFrame } from './OnboardingFrame';

const REQUIRED_RATIO = 0.9;

interface IntroVideoProps {
  url: string;
  onWatched: () => Promise<void>;
}

/**
 * Full-screen intro video. "Let's start" unlocks only after 90% was actually
 * played — seeking past the furthest point watched snaps back.
 */
export function IntroVideo({ url, onWatched }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const furthest = useRef(0);
  const [progress, setProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const unlocked = progress >= REQUIRED_RATIO;

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    // Only count time reached by playing, not by jumping ahead.
    if (v.currentTime <= furthest.current + 1.5) furthest.current = Math.max(furthest.current, v.currentTime);
    const ratio = furthest.current / v.duration;
    if (ratio >= REQUIRED_RATIO && progress < REQUIRED_RATIO) successHaptic();
    setProgress(ratio);
  };

  const onSeeking = () => {
    const v = videoRef.current;
    if (v && v.currentTime > furthest.current + 1.5) v.currentTime = furthest.current;
  };

  return (
    <OnboardingFrame
      footer={
        <PrimaryButton
          className="h-14"
          disabled={!unlocked || isSaving}
          icon={unlocked ? undefined : Lock}
          onClick={async () => {
            setIsSaving(true);
            await onWatched();
            setIsSaving(false);
          }}
        >
          הבנתי, בואו נתחיל
        </PrimaryButton>
      }
    >
      <h1 className="text-screen-title">איך משתמשים באפליקציה</h1>
      <p className="mt-2 text-body text-muted-foreground">כמה דקות שיחסכו לכם הרבה שאלות בהמשך.</p>
      <div className="mt-6 overflow-hidden rounded-card border border-border bg-black">
        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          className="aspect-[9/16] max-h-[60dvh] w-full object-contain"
          onTimeUpdate={onTimeUpdate}
          onSeeking={onSeeking}
          onEnded={() => setProgress(1)}
        />
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-pill bg-card-inner" aria-hidden>
        <div className="h-full rounded-pill bg-primary transition-[width]" style={{ width: `${Math.min(progress / REQUIRED_RATIO, 1) * 100}%` }} />
      </div>
      <p className="mt-2 text-label text-muted-foreground">
        {unlocked ? 'אפשר להמשיך' : 'הכפתור ייפתח בסוף הסרטון'}
      </p>
    </OnboardingFrame>
  );
}
