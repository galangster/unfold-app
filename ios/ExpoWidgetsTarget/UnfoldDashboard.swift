import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct UnfoldDashboard: Widget {
  let name: String = "UnfoldDashboard"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Devotional")
    .description("Your devotional journey at a glance")
    .supportedFamilies([.systemLarge])
  }
}