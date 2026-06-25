import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { getLocator, getLocatorQuery, getLocatorWithIndex, locatorFromTarget, toAriaRole } from '@helpers/locators';
import { renderTemplateArray, renderTemplateObject } from '@helpers/template';
import { TestStore } from '@fixtures/test-data.fixture';

// Minimal fake Page that records what selectors/roles/labels were requested,
// so the pure locator-resolution logic can be tested without a browser.
function createFakePage() {
  const calls: { method: string; args: unknown[] }[] = [];
  const makeLocator = (): Locator =>
    ({
      nth: (i: number) => {
        calls.push({ method: 'nth', args: [i] });
        return makeLocator();
      },
      first: () => {
        calls.push({ method: 'first', args: [] });
        return makeLocator();
      },
    }) as unknown as Locator;

  const page = {
    locator: (selector: string) => {
      calls.push({ method: 'locator', args: [selector] });
      return makeLocator();
    },
    getByRole: (role: string, opts: unknown) => {
      calls.push({ method: 'getByRole', args: [role, opts] });
      return makeLocator();
    },
    getByLabel: (label: string, opts: unknown) => {
      calls.push({ method: 'getByLabel', args: [label, opts] });
      return makeLocator();
    },
  } as unknown as Page;

  return { page, calls };
}

test.describe('locators: toAriaRole', () => {
  test('maps known aliases and passes through unknown roles lowercased', () => {
    expect(toAriaRole('Button')).toBe('button');
    expect(toAriaRole('  LINK ')).toBe('link');
    expect(toAriaRole('treegrid')).toBe('treegrid');
  });
});

test.describe('locators: getLocatorQuery WebdriverIO syntax conversion', () => {
  test('converts tag*=text to :has-text()', () => {
    const { page, calls } = createFakePage();
    getLocatorQuery(page, 'button*=Add to Cart');
    expect(calls[0]).toEqual({ method: 'locator', args: ["button:has-text('Add to Cart')"] });
  });

  test('converts tag=text to :has-text()', () => {
    const { page, calls } = createFakePage();
    getLocatorQuery(page, 'a=Home');
    expect(calls[0]).toEqual({ method: 'locator', args: ["a:has-text('Home')"] });
  });

  test('passes plain CSS/XPath selectors through unchanged', () => {
    const { page, calls } = createFakePage();
    getLocatorQuery(page, '#submit');
    getLocatorQuery(page, "//button[@type='submit']");
    expect(calls[0].args[0]).toBe('#submit');
    expect(calls[1].args[0]).toBe("//button[@type='submit']");
  });

  test('applies nth() when an index is given', () => {
    const { page, calls } = createFakePage();
    getLocatorQuery(page, '.item', 2);
    expect(calls.some((c) => c.method === 'nth' && c.args[0] === 2)).toBe(true);
  });
});

test.describe('locators: getLocatorWithIndex', () => {
  test('parses trailing [N] as 1-based nth', () => {
    const { page, calls } = createFakePage();
    getLocatorWithIndex(page, '.row[3]');
    expect(calls.find((c) => c.method === 'locator')?.args[0]).toBe('.row');
    expect(calls.find((c) => c.method === 'nth')?.args[0]).toBe(2); // 3 -> index 2
  });

  test('defaults to first() when no index and defaultFirst is true', () => {
    const { page, calls } = createFakePage();
    getLocatorWithIndex(page, '.row');
    expect(calls.some((c) => c.method === 'first')).toBe(true);
  });
});

test.describe('locators: locatorFromTarget', () => {
  test('routes label and locator targets', () => {
    const { page, calls } = createFakePage();
    locatorFromTarget(page, 'label', 'Email');
    locatorFromTarget(page, 'locator', '#email');
    expect(calls[0].method).toBe('getByLabel');
    expect(calls[1].method).toBe('locator');
  });

  test('throws on unsupported target', () => {
    const { page } = createFakePage();
    // @ts-expect-error testing the runtime guard
    expect(() => locatorFromTarget(page, 'bogus', 'x')).toThrow(/Unsupported target/);
  });
});

test.describe('locators: getLocator role/attribute matrix', () => {
  test('element + locator uses page.locator', () => {
    const { page, calls } = createFakePage();
    getLocator({ page, role: 'element', attribute: 'locator', value: '#x' });
    expect(calls[0].method).toBe('locator');
  });

  test('role + name uses getByRole', () => {
    const { page, calls } = createFakePage();
    getLocator({ page, role: 'button', attribute: 'name', value: 'Save' });
    expect(calls[0].method).toBe('getByRole');
  });

  test('invalid attribute for element throws', () => {
    const { page } = createFakePage();
    expect(() => getLocator({ page, role: 'element', attribute: 'name', value: 'x' })).toThrow();
  });

  test('non-name attribute for a role throws', () => {
    const { page } = createFakePage();
    expect(() => getLocator({ page, role: 'button', attribute: 'locator', value: 'x' })).toThrow();
  });
});

const fakeTestInfo = { project: { use: { baseURL: 'https://example.test' } } };

test.describe('TestStore: storage + template rendering', () => {
  test('set/get round-trips values', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    store.set('name', 'Alice');
    expect(store.get('name')).toBe('Alice');
  });

  test('setJsonOrString parses JSON, falls back to string', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    store.setJsonOrString('obj', '{"a":1}');
    store.setJsonOrString('plain', 'hello');
    expect(store.get('obj')).toEqual({ a: 1 });
    expect(store.get('plain')).toBe('hello');
  });

  test('renderTemplate resolves stored values via <key> and {{ key }}', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    store.set('city', 'London');
    expect(store.renderTemplate('Hello <city>')).toBe('Hello London');
    expect(store.renderTemplate('Hello {{ city }}')).toBe('Hello London');
  });

  test('renderTemplate resolves the baseUrl generator', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    expect(store.renderTemplate('<baseUrl>/login')).toBe('https://example.test/login');
  });

  test('getValueByIndex supports negative indexing', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    store.set('a', 1);
    store.set('b', 2);
    expect(store.getValueByIndex(-1)).toBe(2);
    expect(store.getValueByIndex(0)).toBe(1);
  });
});

test.describe('template helpers: object/array rendering', () => {
  test('renderTemplateObject renders only string values', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    store.set('city', 'London');
    const out = renderTemplateObject({ a: '<city>', b: 42 }, store);
    expect(out).toEqual({ a: 'London', b: 42 });
  });

  test('renderTemplateArray renders each entry', () => {
    const store = new TestStore({ testInfo: fakeTestInfo as never });
    store.set('city', 'London');
    expect(renderTemplateArray(['<city>', 'plain'], store)).toEqual(['London', 'plain']);
  });
});
