import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn utility function', () => {
  it('merges class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'conditional', false && 'never')).toBe('base conditional')
  })

  it('handles Tailwind conflicts correctly', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles empty and undefined inputs', () => {
    expect(cn()).toBe('')
    expect(cn('', undefined, null)).toBe('')
    expect(cn('valid', '', 'class')).toBe('valid class')
  })

  it('works with arrays and objects', () => {
    expect(cn(['class1', 'class2'])).toBe('class1 class2')
    expect(cn({ 'class1': true, 'class2': false })).toBe('class1')
  })
})
