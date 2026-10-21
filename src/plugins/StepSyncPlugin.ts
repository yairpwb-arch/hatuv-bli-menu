import { registerPlugin } from '@capacitor/core';

export interface StepSyncPlugin {
  setUserConfig(options: {
    userId: string;
    supabaseUrl: string;
    anonKey: string;
    syncToken: string;
  }): Promise<void>;
}

export const StepSync = registerPlugin<StepSyncPlugin>('StepSync');
