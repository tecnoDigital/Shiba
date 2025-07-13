import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger), // Asegura que child() devuelva el mismo mock para encadenamiento
};

export default mockLogger; 