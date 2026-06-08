package com.hatovblitafrit.hatovblitafrit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * StepCounterService — Foreground Service for continuous step counting on Android.
 *
 * Uses the TYPE_STEP_COUNTER hardware sensor (counts since device boot).
 * Persists daily steps to SharedPreferences so data survives app kills.
 *
 * Midnight reset: when the date changes, the sensor baseline is updated
 * and daily count resets to 0.
 *
 * Returns: START_STICKY so Android restarts the service if killed.
 */
class StepCounterService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var stepSensor: Sensor? = null
    private var isListenerRegistered = false

    // Raw cumulative steps from the sensor (since last device boot).
    // -1 = not yet received a sensor event this session.
    private var sensorBaseline = -1

    // Steps since midnight today
    private var dailySteps = 0

    // Date string we are currently tracking (yyyy-MM-dd)
    private var currentDate = ""

    companion object {
        const val CHANNEL_ID       = "step_counter_channel"
        const val NOTIFICATION_ID  = 1001
        const val PREFS_NAME       = "StepCounterPrefs"
        const val KEY_DAILY_STEPS  = "daily_steps"
        const val KEY_DATE         = "step_date"
        const val KEY_SENSOR_BASELINE = "sensor_baseline"
        const val ACTION_STEP_UPDATE  = "com.hatovblitafrit.hatovblitafrit.STEP_UPDATE"
        const val EXTRA_STEPS      = "steps"
        const val EXTRA_DATE       = "date"
        // User config for background DB sync
        const val KEY_USER_ID      = "user_id"
        const val KEY_SUPABASE_URL = "supabase_url"
        const val KEY_ANON_KEY     = "anon_key"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val SYNC_INTERVAL_MS = 5 * 60 * 1000L // sync at most every 5 minutes
    }

    private var lastSyncTime = 0L

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

        // Restore previous session state
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val today = getTodayDate()
        currentDate = today

        if (prefs.getString(KEY_DATE, "") == today) {
            dailySteps    = prefs.getInt(KEY_DAILY_STEPS, 0)
            sensorBaseline = prefs.getInt(KEY_SENSOR_BASELINE, -1)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Promote to foreground — required for health-type services on Android 14+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }

        // Register the sensor listener only once (guard against repeated startService calls)
        if (!isListenerRegistered) {
            stepSensor?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
                isListenerRegistered = true
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isListenerRegistered) {
            sensorManager.unregisterListener(this)
            isListenerRegistered = false
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ─── Sensor callbacks ─────────────────────────────────────────────────────

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return

        val rawTotal = event.values[0].toInt()   // cumulative since boot
        val today = getTodayDate()

        // Midnight crossed — reset baseline so daily count starts at 0
        if (today != currentDate) {
            sensorBaseline = rawTotal
            dailySteps = 0
            currentDate = today
        }

        // First reading this session — capture baseline
        if (sensorBaseline == -1) {
            sensorBaseline = rawTotal
        }

        dailySteps = rawTotal - sensorBaseline
        // Guard: sensor can temporarily report less than baseline after a reboot
        if (dailySteps < 0) dailySteps = 0

        saveState()
        updateNotification()
        broadcastUpdate()

        // Background DB sync — throttled to once every 5 minutes
        val now = System.currentTimeMillis()
        if (now - lastSyncTime >= SYNC_INTERVAL_MS) {
            lastSyncTime = now
            syncToSupabase()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun getTodayDate(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

    private fun syncToSupabase() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val userId      = prefs.getString(KEY_USER_ID, null)      ?: return
        val supabaseUrl = prefs.getString(KEY_SUPABASE_URL, null) ?: return
        val anonKey     = prefs.getString(KEY_ANON_KEY, null)     ?: return
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return
        if (dailySteps <= 0) return

        Thread {
            try {
                val url = URL("$supabaseUrl/rest/v1/steps_log?on_conflict=user_id,date")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("apikey", anonKey)
                conn.setRequestProperty("Authorization", "Bearer $accessToken")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Prefer", "resolution=merge-duplicates")
                conn.connectTimeout = 10_000
                conn.readTimeout    = 10_000
                conn.doOutput       = true

                val body = """{"user_id":"$userId","date":"$currentDate","steps":$dailySteps}"""
                conn.outputStream.bufferedWriter().use { it.write(body) }
                conn.responseCode   // execute the request
                conn.disconnect()
            } catch (_: Exception) {
                // Silently ignore — will retry on next tick
            }
        }.start()
    }

    private fun saveState() {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
            putInt(KEY_DAILY_STEPS, dailySteps)
            putString(KEY_DATE, currentDate)
            putInt(KEY_SENSOR_BASELINE, sensorBaseline)
            apply()
        }
    }

    private fun broadcastUpdate() {
        val intent = Intent(ACTION_STEP_UPDATE).apply {
            putExtra(EXTRA_STEPS, dailySteps)
            putExtra(EXTRA_DATE, currentDate)
            setPackage(packageName)   // restrict to this app — no external receivers
        }
        sendBroadcast(intent)
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("חטוב בלי תפריט")
            .setContentText("$dailySteps צעדים היום")
            .setSmallIcon(R.drawable.ic_steps_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ספירת צעדים",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "מעקב צעדים יומי ברקע"
                setShowBadge(false)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }
}