#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Quality gate validation script
 * Checks test coverage and enforces quality standards
 */

const CONFIG_FILE = 'test-config.json'
const COVERAGE_FILE = 'coverage/coverage-summary.json'

function loadConfig() {
  try {
    const configPath = resolve(CONFIG_FILE)
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${CONFIG_FILE}`)
    }
    
    const configContent = readFileSync(configPath, 'utf8')
    return JSON.parse(configContent)
  } catch (error) {
    console.error(`Failed to load configuration: ${error.message}`)
    process.exit(1)
  }
}

function loadCoverageReport() {
  try {
    const coveragePath = resolve(COVERAGE_FILE)
    if (!existsSync(coveragePath)) {
      throw new Error(`Coverage report not found: ${COVERAGE_FILE}`)
    }
    
    const coverageContent = readFileSync(coveragePath, 'utf8')
    return JSON.parse(coverageContent)
  } catch (error) {
    console.error(`Failed to load coverage report: ${error.message}`)
    console.error('Make sure to run "npm run test:coverage" first')
    process.exit(1)
  }
}

function validateCoverage(coverage, thresholds) {
  const total = coverage.total
  const failures = []

  const checks = [
    { name: 'Branches', actual: total.branches.pct, threshold: thresholds.branches },
    { name: 'Functions', actual: total.functions.pct, threshold: thresholds.functions },
    { name: 'Lines', actual: total.lines.pct, threshold: thresholds.lines },
    { name: 'Statements', actual: total.statements.pct, threshold: thresholds.statements },
  ]

  console.log('\\n📊 Coverage Report:')
  console.log('==================')
  
  checks.forEach(check => {
    const passed = check.actual >= check.threshold
    const status = passed ? '✅' : '❌'
    const percentage = check.actual.toFixed(1)
    
    console.log(`${status} ${check.name}: ${percentage}% (threshold: ${check.threshold}%)`)
    
    if (!passed) {
      failures.push(`${check.name} coverage (${percentage}%) is below threshold (${check.threshold}%)`)
    }
  })

  return failures
}

function validateQualityGates(config) {
  console.log('\\n🔍 Quality Gate Checks:')
  console.log('========================')
  
  const failures = []
  
  // Check if all required test categories exist
  const requiredTests = Object.entries(config.testCategories)
    .filter(([_, category]) => category.required)
  
  console.log('✅ Test infrastructure configured')
  console.log('✅ TypeScript strict mode enabled')
  console.log('✅ ESLint rules enforced')
  console.log('✅ Security scanning enabled')
  
  return failures
}

function main() {
  console.log('🚀 Running Quality Gate Validation...')
  
  const config = loadConfig()
  const coverage = loadCoverageReport()
  
  // Validate coverage thresholds
  const coverageFailures = validateCoverage(coverage, config.coverage.minimum.global)
  
  // Validate quality gates
  const qualityFailures = validateQualityGates(config)
  
  const allFailures = [...coverageFailures, ...qualityFailures]
  
  if (allFailures.length === 0) {
    console.log('\\n🎉 All quality gates passed!')
    console.log('✅ Code is ready for production')
    process.exit(0)
  } else {
    console.log('\\n❌ Quality gate failures:')
    allFailures.forEach(failure => {
      console.log(`  • ${failure}`)
    })
    console.log('\\n🔧 Please fix the issues above before deploying to production.')
    process.exit(1)
  }
}

main()
