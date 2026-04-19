import Foundation

struct ListSelectionBehavior {
    static func selectionAfterMaterializingEmptyListItem(
        editedRange: NSRange,
        insertedMarkerLength: Int
    ) -> NSRange {
        guard editedRange.location == 0, insertedMarkerLength > 0 else {
            return NSRange(location: editedRange.location + insertedMarkerLength, length: 0)
        }

        return NSRange(location: editedRange.location, length: insertedMarkerLength)
    }
}
