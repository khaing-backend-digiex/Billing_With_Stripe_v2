import { addCalendarMonths, monthsBetween } from './date.util';

describe('Date Utility', () => {
  describe('addCalendarMonths', () => {
    it('should add 1 month correctly (Jan 15 -> Feb 15)', () => {
      const start = new Date(2024, 0, 15); // Jan 15, 2024
      const result = addCalendarMonths(start, 1);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1); // Feb
      expect(result.getDate()).toBe(15);
    });

    it('should clamp Jan 31 + 1 month -> Feb 29 (leap year)', () => {
      const start = new Date(2024, 0, 31); // Jan 31, 2024
      const result = addCalendarMonths(start, 1);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1); // Feb
      expect(result.getDate()).toBe(29);
    });

    it('should clamp Jan 31 + 1 month -> Feb 28 (non-leap year)', () => {
      const start = new Date(2023, 0, 31); // Jan 31, 2023
      const result = addCalendarMonths(start, 1);
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(1); // Feb
      expect(result.getDate()).toBe(28);
    });

    it('should handle negative months correctly (Mar 31 - 1 month -> Feb 29)', () => {
      const start = new Date(2024, 2, 31); // Mar 31, 2024
      const result = addCalendarMonths(start, -1);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1); // Feb
      expect(result.getDate()).toBe(29);
    });

    it('should handle crossing year boundaries (Dec 15 + 2 months -> Feb 15 next year)', () => {
      const start = new Date(2023, 11, 15); // Dec 15, 2023
      const result = addCalendarMonths(start, 2);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1); // Feb
      expect(result.getDate()).toBe(15);
    });
  });

  describe('monthsBetween', () => {
    it('should calculate 0 months for same date', () => {
      const anchor = new Date(2024, 0, 15);
      const target = new Date(2024, 0, 15);
      expect(monthsBetween(anchor, target)).toBe(0);
    });

    it('should calculate 1 month exactly', () => {
      const anchor = new Date(2024, 0, 15);
      const target = new Date(2024, 1, 15);
      expect(monthsBetween(anchor, target)).toBe(1);
    });

    it('should calculate 0 months if less than a full month has passed', () => {
      const anchor = new Date(2024, 0, 15);
      const target = new Date(2024, 1, 14);
      expect(monthsBetween(anchor, target)).toBe(0);
    });

    it('should calculate 1 month for clamped dates (Jan 31 -> Feb 28)', () => {
      const anchor = new Date(2023, 0, 31);
      const target = new Date(2023, 1, 28);
      expect(monthsBetween(anchor, target)).toBe(1);
    });
    
    it('should calculate 12 months for 1 year', () => {
      const anchor = new Date(2023, 0, 15);
      const target = new Date(2024, 0, 15);
      expect(monthsBetween(anchor, target)).toBe(12);
    });

    it('should return 0 for target dates before anchor', () => {
      const anchor = new Date(2024, 1, 15);
      const target = new Date(2024, 0, 15);
      expect(monthsBetween(anchor, target)).toBe(0);
    });
  });
});
