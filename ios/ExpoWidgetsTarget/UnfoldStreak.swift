import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct UnfoldStreak: Widget {
  let name: String = "UnfoldStreak"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Streak")
    .description("Your daily reading streak at a glance")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}