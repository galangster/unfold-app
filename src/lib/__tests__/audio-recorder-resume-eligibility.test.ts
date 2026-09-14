import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// This verifies the shipped native patch, not a mocked recorder implementation.
// The incremental FlowDeck build and simulator probe provide native evidence.
const patch = readFileSync(resolve(__dirname, "../../../patches/expo-audio@57.0.4.patch"), "utf8");
const additions = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");

describe("native recorder interruption contract", () => {
  it("revokes permission before pausing capture and preserves its duration", () => {
    expect(additions).toMatch(/func interruptRecording\(\) \{\n\+    allowsRecording = false\n\+    pauseRecording\(\)/);
    expect(additions.match(/recorder\.interruptRecording\(\)/g)).toHaveLength(2);
  });

  it("removes both native system resume paths instead of starting a prepared or paused recorder", () => {
    expect(patch).toContain("-        resumeAllRecorders()");
    expect(patch).toContain("-        _ = try? recorder.startRecording()");
    expect(additions).not.toMatch(/recorder\.startRecording|resumeAllRecorders|canResumeAfterSystemInterruption/);
  });

  it("preserves explicit recording from prepared or paused state", () => {
    // The patch does not alter the native manual start method or its state guard.
    const recorderPatch = patch.split("diff --git a/ios/AudioRecorder.swift")[1].split("diff --git ")[0];
    expect(recorderPatch).not.toContain("func startRecording()");
    expect(recorderPatch).not.toContain("currentState == .prepared || currentState == .paused");
  });
});
