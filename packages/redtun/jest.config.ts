import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // The root of your source code
  roots: ['<rootDir>/src'],
  // Jest test match patterns for finding test files
  testMatch: [
    '**/*.(test).ts', // Matches any .test.ts files in any folder
  ],
  transform: {
    // Use ts-jest for ts / tsx files
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    // If you have paths in your tsconfig, you'll need to replicate them here
  },
  // Add any other Jest configurations you might need
};

export default config;
