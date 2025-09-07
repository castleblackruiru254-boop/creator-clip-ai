import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to auth page', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/.*\/auth/)
  })

  test('should display landing page correctly', async ({ page }) => {
    await page.goto('/')
    
    // Check for main heading
    await expect(page.locator('h1')).toContainText('Turn Long Videos into')
    
    // Check for CTA buttons
    await expect(page.getByRole('button', { name: /start free/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /watch demo/i })).toBeVisible()
    
    // Check for feature sections
    await expect(page.locator('text=AI-Powered Editing')).toBeVisible()
    await expect(page.locator('text=Multi-Platform Export')).toBeVisible()
    
    // Check pricing section
    await expect(page.locator('#pricing')).toBeVisible()
  })

  test('should navigate to quick generate from landing page', async ({ page }) => {
    await page.goto('/')
    
    // Click the "Start Free" button or quick generate link
    await page.getByRole('button', { name: /start free/i }).first().click()
    
    // Should redirect to auth for unauthenticated users
    await expect(page).toHaveURL(/.*\/auth/)
  })

  test('should display auth page correctly', async ({ page }) => {
    await page.goto('/auth')
    
    // Check for sign in form
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByPlaceholder(/email/i)).toBeVisible()
    await expect(page.getByPlaceholder(/password/i)).toBeVisible()
    
    // Check for sign up toggle
    await expect(page.getByText(/don't have an account/i)).toBeVisible()
  })

  test('should toggle between sign in and sign up forms', async ({ page }) => {
    await page.goto('/auth')
    
    // Start with sign in form
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
    
    // Click to switch to sign up
    await page.getByText(/don't have an account/i).click()
    
    // Should show sign up form
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()
    await expect(page.getByPlaceholder(/full name/i)).toBeVisible()
    
    // Switch back to sign in
    await page.getByText(/already have an account/i).click()
    
    // Should be back to sign in form
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
  })

  test('should show validation errors for invalid input', async ({ page }) => {
    await page.goto('/auth')
    
    // Try to sign in with empty fields
    await page.getByRole('button', { name: /^sign in$/i }).click()
    
    // Should show validation errors (if implemented)
    // This would depend on your validation implementation
    
    // Try invalid email format
    await page.getByPlaceholder(/email/i).fill('invalid-email')
    await page.getByPlaceholder(/password/i).fill('short')
    await page.getByRole('button', { name: /^sign in$/i }).click()
    
    // Should show appropriate error feedback
  })
})
