import XCTest

class UnfoldPremiumAuditTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.vibecode.unfold.9fj08t")
    
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app.launch()
    }
    
    func testNavigateToPaywall() {
        // Wait for app to load
        sleep(2)
        
        // Tap on Settings gear icon (top right)
        let settingsButton = app.buttons["Settings"]
        if settingsButton.exists {
            settingsButton.tap()
            sleep(1)
        }
        
        // Take screenshot
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "Settings Screen"
        attachment.lifetime = .keepAlways
        add(attachment)
        
        // Look for Upgrade to Premium button
        let upgradeButton = app.buttons["Upgrade to Premium"]
        if upgradeButton.exists {
            upgradeButton.tap()
            sleep(1)
            
            let paywallScreenshot = XCUIScreen.main.screenshot()
            let paywallAttachment = XCTAttachment(screenshot: paywallScreenshot)
            paywallAttachment.name = "Paywall Screen"
            paywallAttachment.lifetime = .keepAlways
            add(paywallAttachment)
        }
    }
}
