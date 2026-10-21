import Foundation
import HealthKit

/// Registers for HealthKit background step delivery and syncs to Supabase.
/// iOS wakes the app for a few seconds when HealthKit has new step data
/// (hourly at most — the exact timing is up to iOS). Each wake-up uploads the
/// last 7 days, so a day the app was never opened still gets recorded.
class StepSyncHelper {
    static let shared = StepSyncHelper()
    private let healthStore = HKHealthStore()
    private var observerQuery: HKObserverQuery?

    // UserDefaults keys written by StepSyncPlugin.setUserConfig()
    static let kUserId      = "hbm_user_id"
    static let kSupabaseUrl = "hbm_supabase_url"
    static let kAnonKey     = "hbm_anon_key"
    static let kSyncToken   = "hbm_sync_token"
    static let kAccessTokenLegacy = "hbm_access_token"

    private static let syncDays = 7

    // ── Public API ────────────────────────────────────────────────────────────

    /// Call on every app launch (AppDelegate) and whenever credentials are updated.
    func setup() {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }

        healthStore.enableBackgroundDelivery(for: stepType, frequency: .hourly) { _, _ in }

        // Keep only one observer
        if let existing = observerQuery { healthStore.stop(existing) }

        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] _, completionHandler, error in
            guard let self = self, error == nil else { completionHandler(); return }
            self.syncRecentDays(completion: completionHandler)
        }
        observerQuery = query
        healthStore.execute(query)
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /// Gregorian + POSIX so "yyyy-MM-dd" is always a Gregorian date with Western
    /// digits, even on an iPhone set to the Hebrew calendar or another locale.
    private static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        return cal
    }()

    private static func dayString(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.calendar = calendar
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = .current
        fmt.dateFormat = "yyyy-MM-dd"
        return fmt.string(from: date)
    }

    private func syncRecentDays(completion: @escaping () -> Void) {
        let defaults = UserDefaults.standard
        guard let supabaseUrl = defaults.string(forKey: Self.kSupabaseUrl),
              let anonKey     = defaults.string(forKey: Self.kAnonKey),
              let syncToken   = defaults.string(forKey: Self.kSyncToken),
              !syncToken.isEmpty,
              let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            completion(); return
        }

        let cal = Self.calendar
        let now = Date()
        let startToday = cal.startOfDay(for: now)
        guard let start = cal.date(byAdding: .day, value: -(Self.syncDays - 1), to: startToday) else {
            completion(); return
        }

        let query = HKStatisticsCollectionQuery(
            quantityType: stepType,
            quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate),
            options: .cumulativeSum,
            anchorDate: startToday,
            intervalComponents: DateComponents(day: 1)
        )
        query.initialResultsHandler = { [weak self] _, results, error in
            guard let self = self, let results = results, error == nil else { completion(); return }

            var entries: [[String: Any]] = []
            results.enumerateStatistics(from: start, to: now) { stats, _ in
                let steps = Int(stats.sumQuantity()?.doubleValue(for: .count()) ?? 0)
                if steps > 0 {
                    entries.append(["date": Self.dayString(stats.startDate), "steps": steps])
                }
            }
            guard !entries.isEmpty else { completion(); return }

            self.postToSupabase(supabaseUrl: supabaseUrl, anonKey: anonKey,
                                syncToken: syncToken, entries: entries, completion: completion)
        }
        healthStore.execute(query)
    }

    /// Calls `completion` only once the request has finished — telling
    /// HealthKit we're done earlier lets iOS suspend the app mid-upload.
    private func postToSupabase(supabaseUrl: String, anonKey: String, syncToken: String,
                                entries: [[String: Any]], completion: @escaping () -> Void) {
        guard let url = URL(string: "\(supabaseUrl)/rest/v1/rpc/sync_steps_with_token"),
              let body = try? JSONSerialization.data(withJSONObject: ["p_token": syncToken, "p_entries": entries]) else {
            completion(); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue(anonKey,                 forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(anonKey)",     forHTTPHeaderField: "Authorization")
        req.setValue("application/json",      forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        URLSession.shared.dataTask(with: req) { _, _, _ in completion() }.resume()
    }
}
