import { test as base } from 'playwright-bdd';
import type { TestInfo } from '@playwright/test';

// Constants for test data - can be expanded as needed
export const constants: { [key: string]: string } = {
  defaultProject: 'Default Project',
  testUser: 'test-user',
  testPlatform: process.env.TEST_PLATFORM || 'macOS',
};

type GetValueFunc = (item: string) => unknown;

export type DataGenerator = ReturnType<typeof createDataGenerator>;

/**
 * Creates a data generator with various utility functions for generating test data
 */
function createDataGenerator({ testInfo }: { testInfo: TestInfo }) {
  return {
    generateEmail(prefix = 'user', domain = 'example.com'): string {
      const randomString = Math.random().toString(36).substring(2, 8);
      return `${prefix}${randomString}@${domain}`;
    },

    generateDate(format = 'YYYY-MM-DD'): string {
      const date = new Date();
      return format
        .replace('YYYY', date.getFullYear().toString())
        .replace('MM', (date.getMonth() + 1).toString().padStart(2, '0'))
        .replace('DD', date.getDate().toString().padStart(2, '0'));
    },

    generateNumber(min: number, max: number): number {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    repeat(text: string, count: number): string {
      return text.repeat(count);
    },

    baseUrl(): string {
      return String(testInfo.project.use.baseURL);
    },

    constant(value: string): string {
      return constants[value];
    },

    generateUUID(): string {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },

    timestamp(format: 'unix' | 'iso' = 'unix'): string | number {
      if (format === 'iso') {
        return new Date().toISOString();
      }
      return Date.now();
    },
  };
}

/**
 * Parses generator parameters from a string
 */
function parseGeneratorParams(paramsString: string): (string | number | boolean | null)[] {
  if (!paramsString.trim()) return [];
  return paramsString.split(',').map((param) => {
    const trimmed = param.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (!Number.isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed.replace(/^["'](.*)["']$/, '$1');
  });
}

/**
 * Replaces placeholders in a given string with values provided by one or more functions.
 */
function replacePlaceholders(input: string, getValueFuncs: GetValueFunc | GetValueFunc[]): string {
  const funcs = Array.isArray(getValueFuncs) ? getValueFuncs : [getValueFuncs];

  let processedInput = input.replace(/<currentDate-(\d+)>/g, (match, days) => {
    const date = new Date();
    date.setDate(date.getDate() - parseInt(days, 10));
    return date.toISOString();
  });

  processedInput = processedInput.replace(/<currentDate>/g, () => {
    return new Date().toISOString();
  });

  return processedInput.replace(/<([\w\s.:-]+)(?:\[(.*?)\])?>/g, (match, item, params) => {
    const normalizedItem = item.trim().replace(/:/g, '.');
    const itemParts = normalizedItem.split('.');
    let itemValue: unknown;

    for (const func of funcs) {
      let currentValue = func(itemParts[0]);

      if (currentValue !== undefined) {
        for (let i = 1; i < itemParts.length; i++) {
          if (currentValue == null) break;
          currentValue = (currentValue as any)[itemParts[i]];
          if (currentValue === undefined) break;
        }
        itemValue = currentValue;
      }
      if (itemValue !== undefined) break;
    }

    if (itemValue === undefined) {
      return match;
    }

    if (typeof itemValue === 'function') {
      const args = params ? parseGeneratorParams(params) : [];
      return String(itemValue(...args));
    }

    return String(itemValue);
  });
}

/**
 * TestStore manages test data storage and template rendering
 */
export class TestStore {
  private testData: Record<string, unknown> = {};
  private dataGenerator: DataGenerator;
  private valuesList: unknown[] = [];

  constructor({ testInfo }: { testInfo: TestInfo }) {
    this.dataGenerator = createDataGenerator({ testInfo });
  }

  get(prop: string): unknown {
    return this.testData[prop];
  }

  getValueByIndex(index: number): unknown {
    if (index < 0) {
      return this.valuesList[this.valuesList.length + index];
    }
    return this.valuesList[index];
  }

  setJsonOrString(prop: string, value: string): void {
    try {
      const parsedValue = JSON.parse(value);
      this.testData[prop] = parsedValue;
      this.valuesList.push(parsedValue);
    } catch (_e) {
      this.testData[prop] = value;
      this.valuesList.push(value);
    }
  }

  set(prop: string, value: unknown): void {
    this.testData[prop] = value;
    this.valuesList.push(value);
  }

  clear(prop: string): void {
    delete this.testData[prop];
  }

  clearAll(): void {
    this.testData = {};
    this.valuesList = [];
  }

  getAllList(): unknown[] {
    return this.valuesList;
  }

  getAll(): Record<string, unknown> {
    return { ...this.testData };
  }

  renderTemplate(input: string): string {
    const normalizedInput = input.replace(/{{\s*([^}]+)\s*}}/g, (_, key: string) => `<${key.trim()}>`);
    return replacePlaceholders(normalizedInput, [
      (item) => this.get(item),
      (item) => this.dataGenerator[item as keyof DataGenerator],
      (item) => constants[item],
    ]);
  }
}

export type FixturesTestDataType = { testData: TestStore };

export const testDataFixture = base.extend<FixturesTestDataType>({
  testData: async ({}, use, testInfo) => {
    const testData = new TestStore({ testInfo });
    await use(testData);
  },
});
