# Testing Infrastructure

This document describes the comprehensive testing setup for the ViralClips project.

## Overview

The project includes three levels of testing:
- **Unit Tests**: Testing individual components and functions
- **Integration Tests**: Testing API integrations and edge functions  
- **End-to-End Tests**: Testing complete user workflows

## Test Frameworks

### Vitest
- **Purpose**: Unit and integration testing
- **Configuration**: `vitest.config.ts`
- **Coverage**: v8 provider with 70% minimum thresholds

### React Testing Library
- **Purpose**: Component testing with user-centric approach
- **Setup**: Configured with custom render utilities
- **Mocking**: MSW for API mocking

### Playwright
- **Purpose**: End-to-end testing across browsers
- **Configuration**: `playwright.config.ts`
- **Browsers**: Chromium, Firefox, WebKit, Mobile

## Running Tests

### Unit & Integration Tests
```bash
# Run all tests
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui

# Watch mode
npm run test:watch
```

### End-to-End Tests
```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# View report
npm run test:e2e:report
```

### Quality Gates
```bash
# Run full CI pipeline locally
npm run ci:full

# Validate quality thresholds
npm run validate:quality
```

## Test Structure

### Unit Tests
```
src/
├── components/__tests__/
│   ├── PricingSection.test.tsx
│   └── ...
├── pages/__tests__/
│   ├── Dashboard.test.tsx
│   ├── QuickGenerate.test.tsx
│   └── ...
├── contexts/__tests__/
│   ├── AuthContext.test.tsx
│   └── ...
└── lib/__tests__/
    ├── validation.test.ts
    ├── utils.test.ts
    └── ...
```

### Integration Tests
```
src/test/integration/
└── edge-functions.test.ts
```

### E2E Tests
```
tests/e2e/
├── auth.spec.ts
├── quick-generate.spec.ts
└── ...
```

## Mock Setup

### API Mocking with MSW
- **Location**: `src/test/mocks/`
- **Handlers**: Mock Supabase API responses
- **Server**: Configured for both browser and Node.js

### Component Mocking
- **AuthContext**: Mocked for authentication testing
- **Supabase Client**: Mocked for database operations
- **Router**: Mocked for navigation testing

## Coverage Requirements

### Global Thresholds
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

### Current Coverage
✅ **Validation Module**: 98.9% coverage  
✅ **Utility Functions**: 100% coverage  
✅ **Integration Tests**: 8 test scenarios

## CI/CD Integration

### GitHub Actions
- **Workflow**: `.github/workflows/ci-cd.yml`
- **Triggers**: Push to main/develop, PRs to main
- **Steps**: Type check → Lint → Test → Coverage → Build → Deploy

### Quality Gates
- ✅ TypeScript compilation
- ✅ ESLint passing
- ✅ Test coverage thresholds
- ✅ Security scanning
- ✅ Successful build

### Deployment Pipeline
1. **Develop Branch**: Deploy to staging
2. **Main Branch**: Deploy to production (after E2E tests)
3. **Security**: Daily vulnerability scanning

## Security Testing

### Vulnerability Scanning
- **npm audit**: Dependency vulnerability checking
- **Trivy**: Container and filesystem scanning
- **Dependabot**: Automated dependency updates

### Input Validation Testing
- **XSS Prevention**: Testing script injection attempts
- **URL Validation**: YouTube URL format validation
- **Input Sanitization**: Testing malicious input handling

## Best Practices

### Writing Tests
1. **Descriptive Names**: Use clear test descriptions
2. **Arrange-Act-Assert**: Follow AAA pattern
3. **Isolated Tests**: Each test should be independent
4. **Mock External Dependencies**: Use MSW for API calls

### Component Testing
1. **User-Centric**: Test user interactions, not implementation
2. **Accessibility**: Include accessibility testing
3. **Edge Cases**: Test loading, error, and empty states
4. **Responsive**: Test mobile and desktop viewports

### Continuous Integration
1. **Fast Feedback**: Unit tests run on every commit
2. **Quality Gates**: Block deployment if quality checks fail
3. **Security First**: Security scans on every build
4. **Monitoring**: Test results and coverage tracking

## Troubleshooting

### Common Issues
1. **Mock Setup**: Ensure proper mock configuration
2. **Async Testing**: Use waitFor for async operations
3. **Provider Setup**: Include necessary React providers
4. **Path Resolution**: Configure path aliases correctly

### Debugging
```bash
# Debug specific test
npm run test:run -- --reporter=verbose src/path/to/test.ts

# Debug E2E test
npm run test:e2e:debug

# View coverage details
npm run test:coverage && open coverage/index.html
```

## Next Steps

### Expanding Test Coverage
1. **Component Tests**: Add tests for remaining UI components
2. **Hook Tests**: Test custom React hooks
3. **E2E Scenarios**: Add more user workflow tests
4. **Performance Tests**: Add performance benchmarks

### Advanced Testing
1. **Visual Regression**: Screenshot comparison testing
2. **Load Testing**: API endpoint performance testing
3. **A/B Testing**: Feature flag testing infrastructure
4. **Accessibility Testing**: Automated a11y testing

---

**Production Ready**: ✅ This testing infrastructure ensures the application is ready for production deployment with comprehensive test coverage, automated quality gates, and continuous security monitoring.
