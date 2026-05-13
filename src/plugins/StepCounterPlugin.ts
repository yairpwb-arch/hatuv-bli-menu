import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface DailyStepsResult {
  steps: number;
  date: string;
}

export interface StepUpdateEvent {
  steps: number;
  date: string;
}

export interface PermissionResult {
  activityRecognition: 'granted' | 'denied' | 'prompt';
}

export interface StepCounterPlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  getDailySteps(): Promise<DailyStepsResult>;
  checkPermission(): Promise<PermissionResult>;
  requestPermission(): Promise<PermissionResult>;
  addListener(
    eventName: 'stepUpdate',
    listenerFunc: (data: StepUpdateEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/**
 * StepCounter — Capacitor bridge to the native Android StepCounterService.
 * iOS does not use this plugin; it relies on @capgo/capacitor-pedometer directly.
 */
export const StepCounter = registerPlugin<StepCounterPlugin>('StepCounter');
