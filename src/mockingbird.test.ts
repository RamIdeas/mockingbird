import * as babel from '@babel/core';
import generate from '@babel/generator';
import { parse } from '@babel/parser';
import mockingbirdPlugin, {
    buildMockingbird,
    getTestOnlyLocal,
    mockingbird,
    mutateTestOnlyExports,
    testOnlyExport1,
    testOnlyExport2,
} from './mockingbird';

const mockingbirdExport = (constants = [], mutables = []) =>
    generate(buildMockingbird([...constants, ...mutables], mutables)).code;

const testTransform = (input, expected) => {
    expect.assertions(1);

    expected = generate(parse(expected, { sourceType: 'module' })).code;

    const { code: output } = babel.transform(input, {
        presets: ['@babel/preset-typescript'],
        plugins: [mockingbirdPlugin],
        filename: 'filename.ts',
        babelrc: false,
    });

    expect(output).toBe(expected);
};

describe('Mockingbird Plugin', () => {
    describe('with opt-in', () => {
        test('top-level `const` declarations are changed to `let`', () => {
            testTransform(
                `export declare const mockingbird; const one = 1;`,
                `${mockingbirdExport(['one'])} let one = 1;`,
            );
        });

        test('non top-level `const` declarations are NOT changed to `let`', () => {
            testTransform(`export let mockingbird; { const one = 1; }`, `${mockingbirdExport()} { const one = 1; }`);
        });

        test('injects mockingbird export', () => {
            testTransform(`export var mockingbird; const one = 1;`, `${mockingbirdExport(['one'])} let one = 1;`);
        });

        test('does not transpile a file with a `// mockingbird-ignore` comment', () => {
            testTransform(
                `export var mockingbird; const one = 1; // mockingbird-ignore`,
                `export var mockingbird; const one = 1; // mockingbird-ignore`,
            );
        });

        test('stores all bindings as `mockingbird._bindings`', () => {
            testTransform(
                `export var mockingbird; const one = 1; const two = 2; const three = 3;`,
                `${mockingbirdExport(['one', 'two', 'three'])} let one = 1; let two = 2; let three = 3;`,
            );
        });

        test('saves all mutable bindings as `mockingbird._mutables`', () => {
            testTransform(
                `export var mockingbird; const one = 1; let two = 2; let three = 3;`,
                `${mockingbirdExport(['one'], ['two', 'three'])} let one = 1; let two = 2; let three = 3;`,
            );
        });
    });

    describe('without opt-in', () => {
        test('does not change anything', () => {
            testTransform(`const one = 1; { const one = 1; }`, `const one = 1; { const one = 1; }`);
        });
    });
});

describe('Mockingbird methods', () => {
    afterEach(() => mockingbird.unmockAll());

    describe('mock()', () => {
        test('changes the exported reference', () => {
            expect.assertions(4);

            const override = {};

            const result1 = mockingbird.mock('testOnlyExport1', override);
            const result2 = mockingbird.mock('testOnlyExport2');

            expect(testOnlyExport1).toBe(override);
            expect(jest.isMockFunction(testOnlyExport2)).toBe(true);

            expect(result1).toBe(testOnlyExport1);
            expect(result2).toBe(testOnlyExport2);
        });

        test('changes unexported references', () => {
            expect.assertions(1);

            const mock = mockingbird.mock('testOnlyLocal');

            expect(getTestOnlyLocal()).toBe(mock);
        });

        test('changes the default export', () => {
            expect.assertions(1);

            const original = mockingbirdPlugin;

            mockingbird.mock('default');

            expect(mockingbirdExport).not.toBe(original);
        });

        test('repeat calls throw', () => {
            expect.assertions(1);

            mockingbird.mock('testOnlyExport1', 'first');
            const mockFor2ndTime = () => mockingbird.mock('testOnlyExport1', 'second');

            expect(mockFor2ndTime).toThrow();
        });
    });

    describe('unmock()', () => {
        test('resets the exported reference', () => {
            expect.assertions(1);

            const original = testOnlyExport1;
            const override = {};

            mockingbird.mock('testOnlyExport1', override);
            mockingbird.unmock('testOnlyExport1');

            expect(testOnlyExport1).toBe(original);
        });

        test('resets unexported references', () => {
            expect.assertions(1);

            const original = getTestOnlyLocal();

            mockingbird.mock('testOnlyLocal');
            mockingbird.unmock('testOnlyLocal');

            expect(getTestOnlyLocal()).toBe(original);
        });

        test('resets the default export', () => {
            expect.assertions(1);

            const original = mockingbirdPlugin;

            mockingbird.mock('default');

            expect(mockingbirdExport).not.toBe(original);
        });

        test('throws if not mocked', () => {
            expect.assertions(1);

            const original = testOnlyExport1;
            const override = {};

            const unmockBeforeMock = () => mockingbird.unmock('testOnlyExport1');

            expect(unmockBeforeMock).toThrow();
        });
    });

    describe('unmockAll()', () => {
        test('resets all mocked references', () => {
            expect.assertions(2);

            const [original1, original2] = [testOnlyExport1, testOnlyExport2];
            mockingbird.mock('testOnlyExport1', 'first');
            mockingbird.mock('testOnlyExport2', 'second');

            mockingbird.unmockAll();

            expect(testOnlyExport1).toBe(original1);
            expect(testOnlyExport2).toBe(original2);
        });

        test('does not throw if calling without previously mocking anything', () => {
            expect.assertions(1);

            const unmockBeforeAnythingElse = () => mockingbird.unmockAll();

            expect(unmockBeforeAnythingElse).not.toThrow();
        });
    });

    describe('resetMock()', () => {
        test('calls mockReset() on mocked object -- duck-typing a jest.fn()', () => {
            expect.assertions(1);

            const mockReset = jest.fn();
            mockingbird.mock('testOnlyExport1', { mockReset });

            mockingbird.resetMock('testOnlyExport1');

            expect(mockReset).toHaveBeenCalled();
        });

        test('throws if not mocked', () => {
            expect.assertions(1);

            const resetBeforeMock = () => mockingbird.resetMock('testOnlyExport1');

            expect(resetBeforeMock).toThrow();
        });
    });

    describe('resetAllMocks()', () => {
        test('calls mockReset() on all mocked references -- duck-typing a jest.fn()', () => {
            expect.assertions(2);

            const mockReset1 = jest.fn();
            const mockReset2 = jest.fn();
            mockingbird.mock('testOnlyExport1', { mockReset: mockReset1 });
            mockingbird.mock('testOnlyExport2', { mockReset: mockReset2 });

            mockingbird.resetAllMocks();

            expect(mockReset1).toHaveBeenCalled();
            expect(mockReset2).toHaveBeenCalled();
        });

        test('does not throw if .mockReset is not a function', () => {
            expect.assertions(1);

            const mockReset = {};
            mockingbird.mock('testOnlyExport1', { mockReset });
            mockingbird.mock('testOnlyExport2', {});

            const resetMocksWithoutMockResetFunction = () => mockingbird.resetAllMocks();

            expect(resetMocksWithoutMockResetFunction).not.toThrow();
        });
    });

    describe('save() and restore()', () => {
        beforeEach(() => {
            try {
                mockingbird.restoreAll();
            } catch (e) {
                // ignoring errors as this method is tested below
                // it's just convenient to use to restore the module to it's original state
            }
        });

        test('`save` does not mutate the reference', () => {
            expect.assertions(1);

            const initial1 = testOnlyExport1;

            mockingbird.save('testOnlyExport1');

            expect(testOnlyExport1).toBe(initial1);
        });

        test('`restore` throws if called before saving the value first', () => {
            expect.assertions(1);

            const restoreBeforeSave = () => mockingbird.restore('testOnlyExport1');

            expect(restoreBeforeSave).toThrow();
        });

        test('saves value before a mutation and restores again afterwards', () => {
            expect.assertions(2);

            const initial1 = mockingbird.save('testOnlyExport1');
            mutateTestOnlyExports();
            expect(initial1).not.toBe(testOnlyExport1);

            mockingbird.restore('testOnlyExport1');

            expect(testOnlyExport1).toBe(initial1);
        });

        test('saves value multiple times and restores in reverse order', () => {
            expect.assertions(4);

            const initial1 = mockingbird.save('testOnlyExport1');
            mutateTestOnlyExports();
            expect(initial1).not.toBe(testOnlyExport1);

            const mutated1 = mockingbird.save('testOnlyExport1');
            mutateTestOnlyExports();
            expect(mutated1).not.toBe(testOnlyExport1);

            mockingbird.restore('testOnlyExport1');
            expect(testOnlyExport1).toBe(mutated1);

            mockingbird.restore('testOnlyExport1');
            expect(testOnlyExport1).toBe(initial1);
        });

        test('saves values of multiple references before mutations and restores again afterwards', () => {
            expect.assertions(4);

            const initial1 = mockingbird.save('testOnlyExport1');
            const initial2 = mockingbird.save('testOnlyExport2');
            mutateTestOnlyExports();
            expect(initial1).not.toBe(testOnlyExport1);
            expect(initial2).not.toBe(testOnlyExport2);

            mockingbird.restore('testOnlyExport1');
            mockingbird.restore('testOnlyExport2');

            expect(testOnlyExport1).toBe(initial1);
            expect(testOnlyExport2).toBe(initial2);
        });
    });

    describe('saveAll() and restoreAll()', () => {
        beforeEach(() => {
            try {
                mockingbird.restoreAll();
            } catch (e) {
                // ignoring errors as this method is tested here
                // it's just convenient to use to restore the module to it's original state
            }
        });

        test('`saveAll` does not mutate any references', () => {
            expect.assertions(2);

            const initial1 = testOnlyExport1;
            const initial2 = testOnlyExport2;

            mockingbird.saveAll();

            expect(testOnlyExport1).toBe(initial1);
            expect(testOnlyExport2).toBe(initial2);
        });

        test('restoreAll before saving anything should not error', () => {
            expect.assertions(1);

            const restoreAllBeforeSave = () => mockingbird.restoreAll();

            expect(restoreAllBeforeSave).not.toThrow();
        });

        test('saves all values before any mutations and restores again afterwards', () => {
            expect.assertions(4);

            const initial1 = testOnlyExport1;
            const initial2 = testOnlyExport2;
            mockingbird.saveAll();
            mutateTestOnlyExports();
            expect(initial1).not.toBe(testOnlyExport1);
            expect(initial2).not.toBe(testOnlyExport2);

            mockingbird.restoreAll();

            expect(testOnlyExport1).toBe(initial1);
            expect(testOnlyExport2).toBe(initial2);
        });

        test('saves all values multiple times and restores in reverse order', () => {
            expect.assertions(6);

            const initial1 = testOnlyExport1;
            const initial2 = testOnlyExport2;
            mockingbird.saveAll();
            mutateTestOnlyExports();
            expect(initial1).not.toBe(testOnlyExport1);
            expect(initial2).not.toBe(testOnlyExport2);

            const mutated1 = testOnlyExport1;
            const mutated2 = testOnlyExport2;
            mockingbird.saveAll();
            mutateTestOnlyExports();
            expect(mutated1).not.toBe(testOnlyExport1);
            expect(mutated2).not.toBe(testOnlyExport2);

            mockingbird.restoreAll();

            expect(testOnlyExport1).toBe(initial1);
            expect(testOnlyExport2).toBe(initial2);
        });

        test('saving values individually can still be restored to original', () => {
            expect.assertions(4);

            const initial1 = mockingbird.save('testOnlyExport1');
            const initial2 = mockingbird.save('testOnlyExport2');
            mutateTestOnlyExports();
            expect(initial1).not.toBe(testOnlyExport1);
            expect(initial2).not.toBe(testOnlyExport2);

            mockingbird.restoreAll();

            expect(testOnlyExport1).toBe(initial1);
            expect(testOnlyExport2).toBe(initial2);
        });
    });
});
