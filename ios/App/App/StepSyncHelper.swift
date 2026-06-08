import Foundation
import HealthKit

/// Registers for HealthKit background step delivery and syncs to Supabase.
/// Wakes the app for a few seconds whenever HealthKit has new step data (hourly max).
class StepSyncHelper {
    static let shared = StepSyncHelper()
    private let healthStore = HKHealthStore()
    private var observerQuery: HKObserverQuery?

    // UserDefaults keys written by StepSyncPlugin.setUserConfig()
    static let kUserId      = "hbm_user_id"
    static let kSupabaseUrl = "hbm_supabase_url"
    static let kAnonKey     = "hbm_anon_key"
    static let kAccessToken = "hbm_access_token"

    // ── Public API ────────────────────────────────────────────────────────────

    /// Call on every app launch (AppDelegate) and whenever credentials are updated.
    func setup() {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }

        // Enable background delivery at hourly granularity
        healthStore.enableBackgroundDelivery(for: stepType, frequency: .hourly) { _, _ in }

        // Keep only one observer
        if let existing = observerQuery { healthStore.stop(existing) }

        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] _, completionHandler, error in
            guard error == nil else { completionHandler(); return }
            self?.syncTodaySteps(completion: completionHandler)
        }
        observerQuery = query
        healthStore.execute(query)
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private func syncTodaySteps(completion: @escaping () -> Void) {
        let defaults = UserDefaults.standard
        guard let userId      = defaults.string(forKey: Self.kUserId),
              let supabaseUrl = defaults.string(forKey: Self.kSupabaseUrl),
              let anonKey     = defaults.string(forKey: Self.kAnonKey),
              let accessToken = defaults.string(forKey: Self.kAccessToken),
              !userId.isEmpty else { completion(); return }

        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            completion(); return
        }

        let now       = Date()
        let startDay  = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startDay, end: now,
                                                    options: .strictStartDate)

        let statsQuery = HKStatisticsQuery(quantityType: stepType,
                                           quantitySamplePredicate: predicate,
                                           options: .cumulativeSum) { _, result, error in
            defer { completion() }
            guard let sum = result?.sumQuantity(), error == nil else { return }
            let steps = Int(sum.doubleValue(for: .count()))
            guard steps > 0 else { return }

            let dateStr = ISO8601DateFormatter.localDate(from: now)
            self.postToSupabase(userId: userId, supabaseUrl: supabaseUrl,
                                anonKey: anonKey, accessToken: accessToken,
                                date: dateStr, steps: steps)
        }
        healthStore.execute(statsQuery)
    }

    private func postToSupabase(userId: String, supabaseUrl: String,
                                anonKey: String, accessToken: String,
                                date: String, steps: Int) {
        guard let url = URL(string: "\(supabaseUrl)/rest/v1/steps_log?on_conflict=user_id,date") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(anonKey,              forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json",   forHTTPHeaderField: "Content-Type")
        req.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "user_id": userId,
            "date":    date,
            "steps":   steps
        ])
        URLSession.shared.dataTask(with: req).resume()
    }
}

private extension ISO8601DateFormatter {
    static func localDate(from date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        return fmt.string(from: date)
    }
}
