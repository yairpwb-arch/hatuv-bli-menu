import { registerPlugin } from '@capacitor/core';

export interface StepSyncPlugin {
  setUserConfig(options: {
    userId: string;
    supabaseUrl: string;
    anonKey: string;
    accessToken: string;
  }): Promise<void>;
}

export const StepSync = registerPlugin<StepSyncPlugin>('StepSync');
