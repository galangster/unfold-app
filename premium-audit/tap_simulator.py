#!/usr/bin/env python3
"""
Simulate tap on iOS Simulator at given coordinates
"""
import Quartz.CoreGraphics as CG
import time

# Simulator screen coordinates (center of Subscribe button)
# iPhone 17 Pro screen is 393x852 points, 1206x2622 pixels (3x scale)
# Subscribe button is roughly at center horizontally, near bottom vertically
# Estimated position: x=196, y=750 in points = x=588, y=2250 in pixels

# Convert to main screen coordinates - need to find Simulator window
# Let's try clicking at a position on screen where simulator should be

# First, get the main screen bounds
main_display = CG.CGMainDisplayID()
screen_bounds = CG.CGDisplayBounds(main_display)
print(f"Main screen bounds: {screen_bounds}")

# Simulator typically opens at center of screen
# Let's try clicking at screen center + offset for the button
screen_width = screen_bounds.size.width
screen_height = screen_bounds.size.height

# Approximate center of screen where simulator is
center_x = screen_width / 2
center_y = screen_height / 2

# Subscribe button is at bottom of paywall, roughly center horizontally
# Offset from center of simulator (which is around center of screen)
tap_x = center_x  # Center horizontally
tap_y = center_y + 300  # Bottom area of screen

print(f"Will tap at: {tap_x}, {tap_y}")

# Create mouse events
mouse_down = CG.CGEventCreateMouseEvent(
    None, 
    CG.kCGEventLeftMouseDown, 
    (tap_x, tap_y), 
    CG.kCGMouseButtonLeft
)

mouse_up = CG.CGEventCreateMouseEvent(
    None, 
    CG.kCGEventLeftMouseUp, 
    (tap_x, tap_y), 
    CG.kCGMouseButtonLeft
)

# Post events
CG.CGEventPost(CG.kCGHIDEventTap, mouse_down)
time.sleep(0.1)
CG.CGEventPost(CG.kCGHIDEventTap, mouse_up)

print("Tap sent!")
