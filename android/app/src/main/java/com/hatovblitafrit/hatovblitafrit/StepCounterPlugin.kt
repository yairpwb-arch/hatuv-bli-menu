package com.hatovblitafrit.hatovblitafrit

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * StepCounterPlugin — Capacitor bridge between JavaScript and StepCounterService.
 *
 * Exposed methods (callable from JS via registerPlugin('StepCounter')):
 *   startService()       — starts the Foreground Service (idempotent)
 *   stopService()        — stops the Foreground Service
 *   getDailySteps()      — reads today's step count from SharedPreferences
 *   checkPermission()    — returns current ACTIVITY_RECOGNITION permission state
 *   requestPermission()  — requests ACTIVITY_RECOGNITION at runtime (API 29+)
 *
 * Emitted events (via addListener in JS):
 *   'stepUpdate' { steps: number, date: string }
 */
@CapacitorPlugin(
    name = "StepCounter",
    permissions = [
        Permission(
            strings = [Manifest.permission.ACTIVITY_RECOGNITION],
            alias = "activityRecognition"
        )
    ]
)
class StepCounterPlugin : Plugin() {

    private var stepReceiver: BroadcastReceiver? = null

    // ─── Plugin methods ───────────────────────────────────────────────────────

    @PluginMethod
    fun startService(call: PluginCall) {
        val ctx = context
        val intent = Intent(ctx, StepCounterService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
        registerStepReceiver()
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        unregisterStepReceiver()
        context.stopService(Intent(context, StepCounterService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun getDailySteps(call: PluginCall) {
        val prefs = context.getSharedPreferences(StepCounterService.PREFS_NAME, Context.MODE_PRIVATE)
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val savedDate = prefs.getString(StepCounterService.KEY_DATE, "")
        val steps = if (savedDate == today) {
            prefs.getInt(StepCounterService.KEY_DAILY_STEPS, 0)
        } else {
            0
        }
        call.resolve(JSObject().apply {
            put("steps", steps)
            put("date", today)
        })
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val state = getPermissionState("activityRecognition")
        call.resolve(JSObject().apply { put("activityRecognition", stateString(state)) })
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        requestPermissionForAlias("activityRecognition", call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val state = getPermissionState("activityRecognition")
        call.resolve(JSObject().apply { put("activityRecognition", stateString(state)) })
    }

    private fun stateString(state: PermissionState): String = when (state) {
        PermissionState.GRANTED -> "granted"
        PermissionState.DENIED  -> "denied"
        else                    -> "prompt"
    }

    // ─── BroadcastReceiver for live updates ───────────────────────────────────

    private fun registerStepReceiver() {
        if (stepReceiver != null) return   // already registered

        stepReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val steps = intent.getIntExtra(StepCounterService.EXTRA_STEPS, 0)
                val date  = intent.getStringExtra(StepCounterService.EXTRA_DATE) ?: ""
                notifyListeners("stepUpdate", JSObject().apply {
                    put("steps", steps)
                    put("date", date)
                })
            }
        }

        val filter = IntentFilter(StepCounterService.ACTION_STEP_UPDATE)
        // Android 13+ requires explicit exported flag for dynamic receivers
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(stepReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(stepReceiver, filter)
        }
    }

    private fun unregisterStepReceiver() {
        stepReceiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
            stepReceiver = null
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun handleOnDestroy() {
        unregisterStepReceiver()
    }
}
