package expo.modules.missedcallmonitor

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads ONLY missed-call entries (number, time, ring duration) from the Android call log of the
 * admin's work device, after explicit consent. No contact names, address book, call content or
 * other call types are read. Nothing runs in the background from this module.
 */
class MissedCallMonitorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MissedCallMonitor")

    Function("hasPermission") { hasCallLogPermission() }

    AsyncFunction("getMissedCallsSince") { sinceMillis: Double ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "Android context is not available", null)
      if (!hasCallLogPermission()) {
        throw CodedException("ERR_PERMISSION_DENIED", "Call log permission has not been granted", null)
      }
      val calls = mutableListOf<Map<String, Any>>()
      val projection = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION)
      val selection = "${CallLog.Calls.TYPE} = ? AND ${CallLog.Calls.DATE} > ?"
      val args = arrayOf(CallLog.Calls.MISSED_TYPE.toString(), sinceMillis.toLong().toString())
      context.contentResolver.query(CallLog.Calls.CONTENT_URI, projection, selection, args, "${CallLog.Calls.DATE} ASC")?.use { cursor ->
        val numberIdx = cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
        val dateIdx = cursor.getColumnIndexOrThrow(CallLog.Calls.DATE)
        val durationIdx = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION)
        // Oldest-first bounded batch: the JS side advances its cursor past the last entry, so any
        // remaining (newer) calls are returned by the next sync and none are skipped.
        while (cursor.moveToNext() && calls.size < MAX_BATCH) {
          val number = cursor.getString(numberIdx)
          // Withheld / private numbers cannot be replied to and are skipped.
          if (number.isNullOrBlank() || number.startsWith("-")) continue
          calls.add(
            mapOf(
              "number" to number,
              "timestamp" to cursor.getLong(dateIdx).toDouble(),
              "durationSeconds" to cursor.getLong(durationIdx).toInt()
            )
          )
        }
      }
      calls
    }
  }

  companion object {
    private const val MAX_BATCH = 100
  }

  private fun hasCallLogPermission(): Boolean {
    val context = appContext.reactContext ?: return false
    // Platform API (minSdk 24 ≥ 23) — avoids an extra androidx dependency in this library module.
    return context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
  }
}
