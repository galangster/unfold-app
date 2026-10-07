import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct UnfoldVerse: Widget {
  let name: String = "UnfoldVerse"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Today's Verse")
    .description("See today's verse from your series on your Lock Screen.")
    .supportedFamilies([.accessoryInline, .accessoryRectangular, .accessoryCircular])
  }
}