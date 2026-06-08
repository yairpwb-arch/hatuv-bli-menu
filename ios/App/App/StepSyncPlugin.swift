import Foundation
import Capacitor

/// Capacitor 8 inline plugin — saves Supabase credentials to UserDefaults
/// so StepSyncHelper can reach the DB from the background.
@objc(StepSyncPlugin)
public class StepSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier   = "StepSyncPlugin"
    public let jsName       = "StepSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setUserConfig", returnType: CAPPluginReturnPromise)
    ]

    @objc func setUserConfig(_ call: CAPPluginCall) {
        guard let userId      = call.getString("userId"),
              let supabaseUrl = call.getString("supabaseUrl"),
              let anonKey     = call.getString("anonKey"),
              let accessToken = call.getString("accessToken") else {
            call.reject("Missing required parameters")
            return
        }

        let d = UserDefaults.standard
        d.set(userId,      forKey: StepSyncHelper.kUserId)
        d.set(supabaseUrl, forKey: StepSyncHelper.kSupabaseUrl)
        d.set(anonKey,     forKey: StepSyncHelper.kAnonKey)
        d.set(accessToken, forKey: StepSyncHelper.kAccessToken)

        // Re-register background delivery with fresh credentials
        StepSyncHelper.shared.setup()

        call.resolve()
    }
}
