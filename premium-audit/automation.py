#!/usr/bin/env python3
"""UI Automation script for Unfold Premium Audit"""
import subprocess
import time
import sys

def take_screenshot(name):
    """Take a screenshot of the simulator"""
    path = f"/Users/galangster/clawd/work/unfold/app/mobile/premium-audit/{name}.png"
    subprocess.run([
        "xcrun", "simctl", "io", "booted", "screenshot", path
    ], check=True)
    print(f"Screenshot saved: {path}")
    return path

def click(x, y):
    """Click at screen coordinates using cliclick"""
    subprocess.run(["cliclick", f"c:{x},{y}"], check=True)
    time.sleep(0.5)

def main():
    print("Starting Unfold Premium Audit...")
    
    # Take initial screenshot
    take_screenshot("00-initial")
    
    # Try to click on various UI elements
    # Settings gear icon (top right) - try different positions
    print("Trying to click settings gear...")
    
    # The simulator window center from defaults is {1919, 1382}
    # iPhone 17 Pro is 393x852 points at 3x scale = 1179x2556 pixels
    # But screenshots are 1206x2622, suggesting some padding/bars
    
    # Let's try clicking relative to the window center
    # Gear icon is at top right of the app interface
    # In the 1206x2622 screenshot: approximately x=1100, y=150
    # Offset from center (603, 1311): dx=497, dy=-1161
    # Assuming the simulator displays at 50% scale on a 4K display
    # Screen coords: 1919 + 497*0.5, 1382 - 1161*0.5 = 2167.5, 801.5
    
    # Let's try a range of positions around the expected location
    positions = [
        (2100, 750),
        (2150, 800), 
        (2200, 850),
        (1919, 1382),  # Window center
    ]
    
    for i, (x, y) in enumerate(positions):
        print(f"Clicking at {x}, {y} (attempt {i+1})...")
        click(x, y)
        time.sleep(1)
        take_screenshot(f"01-click-test-{i+1}")
    
    print("Done!")

if __name__ == "__main__":
    main()
