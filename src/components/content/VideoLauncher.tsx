import { Capacitor } from '@capacitor/core';
import { ExternalLink, Play } from 'lucide-react';
import { PrimaryButton } from '@/components/ds';

interface VideoLauncherProps {
  /** Video URL, or a guide/resource link. */
  url: string;
  isVideo: boolean;
  label?: string;
  className?: string;
  onOpened?: () => void;
}

/**
 * The one place content gets opened. Today it hands the link to the system
 * (YouTube / browser); swapping this component's body for an in-app player
 * later changes every screen that plays content, with no other edits.
 */
export function VideoLauncher({ url, isVideo, label, className, onOpened, onPlay }: VideoLauncherProps & { onPlay?: () => void }) {
  const open = () => {
    // A video hosted on Bunny plays inside the app; anything else opens outside.
    if (onPlay) onPlay();
    else window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
    onOpened?.();
  };
  return (
    <PrimaryButton icon={isVideo ? Play : ExternalLink} onClick={open} className={className}>
      {label ?? (isVideo ? 'צפה עכשיו' : 'פתח מדריך')}
    </PrimaryButton>
  );
}
