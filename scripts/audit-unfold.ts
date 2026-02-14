#!/usr/bin/env tsx
/**
 * Unfold App - Complete Visual Audit
 * 
 * Analyzes every screen, workflow, and animation
 * using the Visual Feedback Loop system
 */

import { visualFeedbackLoop } from './visual-feedback-loop';
import * as fs from 'fs';
import * as path from 'path';

interface ScreenAudit {
  name: string;
  path: string;
  interaction: 'scroll' | 'click' | 'animation' | 'full-flow';
  components: string[];
  expectedAnimations: string[];
}

// Define all Unfold screens to audit
const UNFOLD_SCREENS: ScreenAudit[] = [
  {
    name: 'Welcome Screen',
    path: '/welcome',
    interaction: 'full-flow',
    components: ['Brand icon', 'Quick Start button', 'Personalize button'],
    expectedAnimations: ['Staggered entrance', 'Icon rotation', 'Button spring']
  },
  {
    name: 'Style Onboarding',
    path: '/style-onboarding',
    interaction: 'full-flow',
    components: ['Question cards', 'Option buttons', 'Progress indicator'],
    expectedAnimations: ['Slide transitions', 'Option fade-in', 'Progress spring']
  },
  {
    name: 'Home Screen',
    path: '/(main)/home',
    interaction: 'scroll',
    components: ['Streak display', 'Devotional cards', 'Progress bar'],
    expectedAnimations: ['Streak spring', 'Card entrance', 'Progress glow']
  },
  {
    name: 'Reading Screen',
    path: '/(main)/reading',
    interaction: 'scroll',
    components: ['Reading content', 'Complete Day button', 'Audio player'],
    expectedAnimations: ['Scroll-linked header', 'Button scale', 'Waveform dance']
  },
  {
    name: 'Settings',
    path: '/(main)/settings',
    interaction: 'click',
    components: ['Profile section', 'Theme toggle', 'Voice selector'],
    expectedAnimations: ['Toggle slide', 'Voice wave preview', 'Button feedback']
  },
  {
    name: 'Component Showcase',
    path: '/showcase',
    interaction: 'animation',
    components: ['StreakDisplay', 'SparkleBurst', 'AudioWaveform'],
    expectedAnimations: ['Flame flicker', 'Star particles', 'Bar springs']
  }
];

async function auditUnfoldComprehensive() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Unfold App - Complete Visual Audit                   ║
║     Using Visual Feedback Loop System                    ║
╚══════════════════════════════════════════════════════════╝

This will analyze every screen, workflow, and animation
using AI video analysis to catch issues invisible to screenshots.

Analyzing: ${UNFOLD_SCREENS.length} screens
Breakpoints: Mobile (375×667) + Desktop (1280×720)
Focus: Animations, transitions, performance

Starting Expo Web server...
`);
  
  const baseUrl = 'http://localhost:8081';
  const results = [];
  
  // Check if server is running
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      console.log('⚠️  Expo Web server not running.');
      console.log('   Please run: npx expo start --web');
      console.log('   Then re-run this audit.\n');
      return;
    }
  } catch {
    console.log('⚠️  Expo Web server not running.');
    console.log('   Please run: npx expo start --web');
    console.log('   Then re-run this audit.\n');
    return;
  }
  
  console.log('✅ Expo Web server detected\n');
  
  // Audit each screen
  for (const screen of UNFOLD_SCREENS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📱 AUDITING: ${screen.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Path: ${screen.path}`);
    console.log(`Interaction: ${screen.interaction}`);
    console.log(`Components: ${screen.components.join(', ')}`);
    console.log(`Expected animations: ${screen.expectedAnimations.join(', ')}`);
    console.log();
    
    try {
      const result = await visualFeedbackLoop({
        showcaseUrl: `${baseUrl}${screen.path}`,
        interaction: screen.interaction,
        maxIterations: 3,
        focus: ['animations', 'transitions', 'performance'],
        breakpoints: ['mobile', 'desktop']
      });
      
      results.push({
        screen: screen.name,
        path: screen.path,
        ...result
      });
      
      // Immediate feedback
      if (result.success) {
        console.log(`\n✅ ${screen.name}: PASSED`);
        console.log(`   Quality achieved in ${result.iterations} iterations`);
      } else {
        console.log(`\n⚠️  ${screen.name}: NEEDS WORK`);
        console.log(`   ${result.finalIssues.length} issues remaining`);
        
        if (result.finalIssues.length > 0) {
          console.log('\n   Top issues:');
          result.finalIssues
            .filter(i => i.severity === 'critical' || i.severity === 'major')
            .slice(0, 3)
            .forEach(issue => {
              const emoji = issue.severity === 'critical' ? '🔴' : '🟡';
              console.log(`   ${emoji} ${issue.issue}`);
              console.log(`      Fix: ${issue.suggestedFix}`);
            });
        }
      }
      
    } catch (error) {
      console.error(`\n❌ Failed to audit ${screen.name}:`, error.message);
      results.push({
        screen: screen.name,
        path: screen.path,
        success: false,
        error: error.message,
        iterations: 0,
        finalIssues: [],
        videos: []
      });
    }
  }
  
  // Generate comprehensive report
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 COMPREHENSIVE AUDIT REPORT');
  console.log(`${'='.repeat(60)}\n`);
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success && !r.error).length;
  const errors = results.filter(r => r.error).length;
  const totalIssues = results.reduce((sum, r) => sum + r.finalIssues.length, 0);
  
  console.log(`Screens audited: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Needs work: ${failed}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`🐛 Total issues found: ${totalIssues}`);
  console.log();
  
  // Summary table
  console.log('Detailed Results:');
  console.log('-'.repeat(60));
  console.log(`${'Screen'.padEnd(25)} ${'Status'.padEnd(10)} ${'Issues'.padEnd(8)} ${'Videos'.padEnd(8)}`);
  console.log('-'.repeat(60));
  
  results.forEach(r => {
    const status = r.success ? '✅ PASS' : r.error ? '❌ ERROR' : '⚠️  WARN';
    const issues = r.finalIssues?.length || 0;
    const videos = r.videos?.length || 0;
    console.log(`${r.screen.padEnd(25)} ${status.padEnd(10)} ${issues.toString().padEnd(8)} ${videos.toString().padEnd(8)}`);
  });
  
  console.log();
  
  // Critical issues summary
  const allIssues = results.flatMap(r => 
    r.finalIssues?.map(i => ({ ...i, screen: r.screen })) || []
  );
  
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const majorIssues = allIssues.filter(i => i.severity === 'major');
  
  if (criticalIssues.length > 0) {
    console.log('\n🔴 CRITICAL ISSUES (Must Fix):');
    console.log('-'.repeat(60));
    criticalIssues.forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.screen}] ${issue.issue}`);
      console.log(`   Fix: ${issue.suggestedFix}`);
      console.log();
    });
  }
  
  if (majorIssues.length > 0) {
    console.log('\n🟡 MAJOR ISSUES (Should Fix):');
    console.log('-'.repeat(60));
    majorIssues.slice(0, 10).forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.screen}] ${issue.issue}`);
    });
    if (majorIssues.length > 10) {
      console.log(`... and ${majorIssues.length - 10} more`);
    }
  }
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'unfold-visual-audit-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      screensAudited: results.length,
      passed,
      failed,
      errors,
      totalIssues,
      criticalIssues: criticalIssues.length,
      majorIssues: majorIssues.length
    },
    results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved: ${reportPath}`);
  
  // Next steps
  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 NEXT STEPS');
  console.log(`${'='.repeat(60)}\n`);
  
  if (criticalIssues.length > 0) {
    console.log('1. Fix CRITICAL issues first (blocking release)');
    console.log('2. Re-run audit to verify fixes');
  } else if (majorIssues.length > 0) {
    console.log('1. Fix MAJOR issues for better UX');
    console.log('2. Consider minor issues for polish');
  } else if (failed > 0) {
    console.log('1. Review failed screens for optimization opportunities');
  } else {
    console.log('🎉 All screens passed! App is visually polished!');
    console.log('Ready for App Store submission.');
  }
  
  console.log(`\nAll recordings saved to: ./videos/`);
  console.log('Review videos manually for additional insights.\n');
}

// Run audit
auditUnfoldComprehensive().catch(console.error);
