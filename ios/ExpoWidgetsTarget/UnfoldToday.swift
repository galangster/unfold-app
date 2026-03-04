import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct UnfoldToday: Widget {
  let name: String = "UnfoldToday"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Today's Reading")
    .description("Today's devotional with scripture preview")
    .supportedFamilies([.systemMedium])
  }
}