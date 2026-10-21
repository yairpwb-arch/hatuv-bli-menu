package com.hatovblitafrit.hatovblitafrit

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Restarts StepCounterService after a reboot or an app update — START_STICKY
 * only covers the service being killed, not those two cases, so without this
 * no steps were counted until the user happened to open the app again.
 */
class StepBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) !=
                PackageManager.PERMISSION_GRANTED
        ) return

        // Only for a user who has actually set up step tracking in the app.
        val prefs = context.getSharedPreferences(StepCounterService.PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getString(StepCounterService.KEY_SYNC_TOKEN, null) == null) return

        try {
            ContextCompat.startForegroundService(context, Intent(context, StepCounterService::class.java))
        } catch (_: Exception) {
            // Some OEMs still block this; the service starts again on next app open.
        }
    }
}
