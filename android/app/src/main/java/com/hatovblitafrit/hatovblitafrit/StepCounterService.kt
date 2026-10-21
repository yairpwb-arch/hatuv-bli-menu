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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * StepCounterService — Foreground Service for continuous step counting on Android.
 *
 * TYPE_STEP_COUNTER reports a running total since device boot. Instead of
 * subtracting a per-day baseline (which broke after a reboot and dropped the
 * steps taken between the last reading before midnight and the first one
 * after), each reading adds only the increase since the previous reading to
 * the current day. A reboot is detected via the boot count, in which case the
 * whole new reading counts as new steps.
 *
 * Keeps a 14-day history and uploads any day whose count changed — hourly,
 * every few minutes while walking, and whenever the service (re)starts — via
 * a per-device sync token, so uploads keep working when the app isn't opened.
 */
class StepCounterService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var stepSensor: Sensor? = null
    private var isListenerRegistered = false

    private var dailySteps = 0
    private var currentDate = ""
    private var lastRaw = -1L
    private var lastBootCount = -1

    @Volatile private var lastSyncTime = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val hourlyFlush = object : Runnable {
        override fun run() {
            rollOverIfNewDay()
            flushPending(force = true)
            handler.postDelayed(this, HOURLY_MS)
        }
    }

    companion object {
        const val CHANNEL_ID          = "step_counter_channel"
        const val NOTIFICATION_ID     = 1001
        const val PREFS_NAME          = "StepCounterPrefs"
        const val KEY_DAILY_STEPS     = "daily_steps"
        const val KEY_DATE            = "step_date"
        const val KEY_LAST_RAW        = "last_raw_total"
        const val KEY_LAST_BOOT       = "last_boot_count"
        const val KEY_HISTORY         = "history_json"   // {"yyyy-MM-dd": steps}
        const val KEY_SYNCED          = "synced_json"    // {"yyyy-MM-dd": steps last uploaded}
        const val ACTION_STEP_UPDATE  = "com.hatovblitafrit.hatovblitafrit.STEP_UPDATE"
        const val EXTRA_STEPS         = "steps"
        const val EXTRA_DATE          = "date"
        // User config for background DB sync
        const val KEY_USER_ID         = "user_id"
        const val KEY_SUPABASE_URL    = "supabase_url"
        const val KEY_ANON_KEY        = "anon_key"
        const val KEY_SYNC_TOKEN      = "sync_token"
        const val KEY_ACCESS_TOKEN_LEGACY = "access_token"

        const val SYNC_INTERVAL_MS    = 5 * 60 * 1000L
        const val HOURLY_MS           = 60 * 60 * 1000L
        const val HISTORY_DAYS        = 14
        // A single reading can't plausibly add more than this; guards against a
        // garbage sensor value or a very long gap being dumped into one day.
        const val MAX_DELTA           = 30_000L

        fun dateString(date: Date): String =
            SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

        fun todayString(): String = dateString(Date())
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

        val prefs = prefs()
        currentDate = prefs.getString(KEY_DATE, null) ?: todayString()
        dailySteps  = prefs.getInt(KEY_DAILY_STEPS, 0)
        lastRaw       = prefs.getLong(KEY_LAST_RAW, -1L)
        lastBootCount = prefs.getInt(KEY_LAST_BOOT, -1)
        rollOverIfNewDay()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Promote to foreground — required for health-type services on Android 14+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }

        // Register the sensor listener only once (guard against repeated startService calls)
        if (!isListenerRegistered) {
            stepSensor?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
                isListenerRegistered = true
            }
            handler.removeCallbacks(hourlyFlush)
            handler.postDelayed(hourlyFlush, HOURLY_MS)
        }

        // App opened / device booted / app updated — catch up on anything unsent.
        flushPending(force = true)
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(hourlyFlush)
        if (isListenerRegistered) {
            sensorManager.unregisterListener(this)
            isListenerRegistered = false
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ─── Sensor callbacks ─────────────────────────────────────────────────────

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return

        val raw = event.values[0].toLong()
        val boot = currentBootCount()
        val rebooted = boot != -1 && lastBootCount != -1 && boot != lastBootCount

        val delta = when {
            lastRaw < 0          -> 0L    // first reading ever — nothing to compare against
            rebooted || raw < lastRaw -> raw   // sensor restarted from 0 at boot
            else                 -> raw - lastRaw
        }.coerceIn(0L, MAX_DELTA)

        lastRaw = raw
        lastBootCount = boot

        val changedDay = rollOverIfNewDay()
        dailySteps += delta.toInt()

        saveState()
        updateNotification()
        broadcastUpdate()
        flushPending(force = changedDay)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ─── Day handling ─────────────────────────────────────────────────────────

    /** Moves to a new day if the date changed; the old day stays in history. */
    @Synchronized
    private fun rollOverIfNewDay(): Boolean {
        val today = todayString()
        if (today == currentDate) return false
        recordHistory(currentDate, dailySteps)
        currentDate = today
        dailySteps = 0
        saveState()
        return true
    }

    private fun currentBootCount(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try { Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT) } catch (_: Exception) { -1 }
        } else -1

    // ─── Persistence ──────────────────────────────────────────────────────────

    private fun prefs() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun readJson(key: String): JSONObject =
        try { JSONObject(prefs().getString(key, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }

    private fun historyCutoff(): String {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -(HISTORY_DAYS - 1))
        return dateString(cal.time)
    }

    private fun pruned(json: JSONObject): JSONObject {
        val cutoff = historyCutoff()
        val out = JSONObject()
        json.keys().forEach { day -> if (day >= cutoff) out.put(day, json.optInt(day)) }
        return out
    }

    @Synchronized
    private fun recordHistory(date: String, steps: Int) {
        if (date.isEmpty()) return
        val history = readJson(KEY_HISTORY)
        if (steps >= history.optInt(date, 0)) history.put(date, steps)
        prefs().edit().putString(KEY_HISTORY, pruned(history).toString()).apply()
    }

    @Synchronized
    private fun saveState() {
        recordHistory(currentDate, dailySteps)
        prefs().edit().apply {
            putInt(KEY_DAILY_STEPS, dailySteps)
            putString(KEY_DATE, currentDate)
            putLong(KEY_LAST_RAW, lastRaw)
            putInt(KEY_LAST_BOOT, lastBootCount)
            apply()
        }
    }

    // ─── Upload ───────────────────────────────────────────────────────────────

    private fun flushPending(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - lastSyncTime < SYNC_INTERVAL_MS) return

        val prefs = prefs()
        val supabaseUrl = prefs.getString(KEY_SUPABASE_URL, null) ?: return
        val anonKey     = prefs.getString(KEY_ANON_KEY, null)     ?: return
        val syncToken   = prefs.getString(KEY_SYNC_TOKEN, null)   ?: return

        val pending = JSONObject()
        synchronized(this) {
            val history = readJson(KEY_HISTORY)
            val synced  = readJson(KEY_SYNCED)
            history.keys().forEach { day ->
                val steps = history.optInt(day, 0)
                if (steps > 0 && steps != synced.optInt(day, -1)) pending.put(day, steps)
            }
        }
        if (pending.length() == 0) return
        lastSyncTime = now

        Thread {
            try {
                val entries = JSONArray()
                pending.keys().forEach { day ->
                    entries.put(JSONObject().put("date", day).put("steps", pending.getInt(day)))
                }
                val body = JSONObject().put("p_token", syncToken).put("p_entries", entries).toString()

                val conn = URL("$supabaseUrl/rest/v1/rpc/sync_steps_with_token").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("apikey", anonKey)
                conn.setRequestProperty("Authorization", "Bearer $anonKey")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.connectTimeout = 15_000
                conn.readTimeout    = 15_000
                conn.doOutput       = true
                conn.outputStream.bufferedWriter().use { it.write(body) }
                val code = conn.responseCode
                conn.disconnect()

                if (code in 200..299) {
                    synchronized(this) {
                        val synced = readJson(KEY_SYNCED)
                        pending.keys().forEach { day -> synced.put(day, pending.getInt(day)) }
                        prefs().edit().putString(KEY_SYNCED, pruned(synced).toString()).apply()
                    }
                } else {
                    lastSyncTime = 0L // let the next reading retry instead of waiting out the throttle
                }
            } catch (_: Exception) {
                lastSyncTime = 0L // offline — retried on the next reading or hourly tick
            }
        }.start()
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
