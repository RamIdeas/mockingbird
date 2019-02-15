import { PluginObj, types as t, template, Visitor } from '@babel/core';
import { NodePath } from '@babel/traverse';

// mockingbird-ignore

interface State {
    ignore: boolean;
    injected: boolean;
    bindings: string[];
    mutables: string[];
}

export default (): PluginObj => {
    return {
        name: 'babel-plugin-mockingbird',
        visitor: {
            Program: {
                enter(path: NodePath<t.Program>, state: State) {
                    const source = path.getSource();

                    const optIn = /export( declare)? (const|let|var) mockingbird(: Mockingbird)?;?/.test(source);

                    const ignore = /\smockingbird-ignore\b/.test(source);

                    state.ignore = !optIn || ignore;
                    state.bindings = Object.keys(path.scope.bindings).filter(name => name !== 'mockingbird');
                    state.mutables = Object.values(path.scope.bindings)
                        .filter(b => (b.kind === 'var' || b.kind === 'let') && b.identifier.name !== 'mockingbird')
                        .map(b => b.identifier.name);
                },
            },
            VariableDeclaration(path: NodePath<t.VariableDeclaration>, state: State) {
                if (state.ignore) return;

                const { node, parentPath } = path;
                if (node.kind !== 'const') return;

                const { id } = node.declarations[0];
                if (t.isIdentifier(id) && id.name === 'mockingbird') return;

                const isTopLevel = parentPath.isProgram() || parentPath.isExportNamedDeclaration();
                if (isTopLevel) node.kind = 'let';
            },
            ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>, state: State) {
                if (state.ignore) return;
                if (state.injected) return;

                const { declaration } = path.node;

                if (!t.isVariableDeclaration(declaration)) return;
                if (declaration.declarations.length === 0) return;

                const declarator = declaration.declarations[0];

                if (!t.isIdentifier(declarator.id)) return;
                if (declarator.id.name !== 'mockingbird') return;

                path.replaceWith(buildMockingbird(state.bindings, state.mutables));

                state.injected = true;
            },
        },
    };
};

/*
    Assumptions:
        * babel transpiles:
            - `export const one = 1; log(one);`            -->    `var one = exports.one = 1; log(one);`
            - `const one = 1; export { one }; log(one)`    -->    `var one = 1; export.one = one; log(one);`
            i.e. there is a local variable and an `exports` object to keep in sync
        * `refName` is 'default' or a valid Identifier
        * exported variable names match the local identifiers (no aliasing with `as`)
        * `jest` is in scope (global)
*/

export interface Mockingbird {
    mock<T = jest.Mock>(refName: 'default', mockImplementation?: T): T;
    mock<T = jest.Mock>(refName: string, mockImplementation?: T): T;
    unmock(refName: string): any;
    resetMock(refName: string): void;
    unmockAll(): void;
    resetAllMocks(): void;
    save<T = any>(refName: string): T;
    restore<T = any>(refName: string): T;
    saveAll(): void;
    restoreAll(): void;
}

interface PrivateMockingbird extends Mockingbird {
    _bindings: string[];
    _mutables: string[];
    _restoration_points: Map<string, any[]>;
    _cache: Map<string, any>;
    _set(refName: string, value: any): void;
    _reset(refName: string): void;
}

export const mockingbird: PrivateMockingbird = {
    _bindings: [],
    _mutables: [],
    _restoration_points: new Map<string, any>(),
    _cache: new Map<string, any>(),
    _set: function(refName: string, value: any) {
        if (refName !== 'default') eval(`${refName} = value;`);

        const isExport = Object.prototype.hasOwnProperty.call(exports, refName);
        if (isExport) eval(`exports[refName] = value;`);
    },
    _reset: function(refName: string) {
        eval(
            `if (typeof ${refName} !== 'undefined' && typeof ${refName}.mockReset === 'function') ${refName}.mockReset();`,
        );
    },

    mock: function(refName: string, mockImplementation: any = jest.fn()) {
        if (mockingbird._cache.has(refName)) {
            throw new Error(`The reference "${refName}" has already been mocked`);
        }

        const originalImplementation = refName === 'default' ? eval('exports.default') : eval(refName);
        mockingbird._cache.set(refName, originalImplementation);
        mockingbird._set(refName, mockImplementation);

        return mockImplementation;
    },
    unmock: function(refName: string) {
        if (!mockingbird._cache.has(refName)) {
            throw new Error(`The reference "${refName}" has NOT been mocked so cannot be unmocked`);
        }

        const originalImplementation = mockingbird._cache.get(refName);

        mockingbird._set(refName, originalImplementation);
        mockingbird._cache.delete(refName);

        return originalImplementation;
    },
    unmockAll: function() {
        mockingbird._cache.forEach((originalImplementation, refName) => {
            mockingbird._set(refName, originalImplementation);
        });

        mockingbird._cache.clear();
    },
    resetMock: function(refName?: string) {
        if (!mockingbird._cache.has(refName)) {
            throw new Error(`The reference "${refName}" has NOT been mocked so cannot be unmocked`);
        }

        mockingbird._reset(refName);
    },
    resetAllMocks: function() {
        mockingbird._cache.forEach((_, refName) => {
            mockingbird._reset(refName);
        });
    },

    save: function(refName: string) {
        if (mockingbird._restoration_points.has(refName) === false) {
            mockingbird._restoration_points.set(refName, []);
        }

        const restoration_points = mockingbird._restoration_points.get(refName);
        const value = eval(refName);

        restoration_points.push(value);

        return value;
    },
    restore: function(refName: string) {
        const restoration_points = mockingbird._restoration_points.get(refName);

        if (restoration_points.length === 0) {
            throw new Error(`The reference "${refName}" has no restoration points - you must save one first`);
        }

        const value = restoration_points.pop();
        mockingbird._set(refName, value);

        return value;
    },
    saveAll: function() {
        for (let refName of mockingbird._mutables) {
            mockingbird.save(refName);
        }
    },
    restoreAll: function() {
        for (let refName of mockingbird._mutables) {
            const restoration_points = mockingbird._restoration_points.get(refName) || [];

            if (restoration_points.length) {
                const value = restoration_points[0];
                mockingbird._set(refName, value);
                mockingbird._restoration_points.set(refName, []);
            }
        }
    },
};

export const mockingbirdTemplate = template(
    `export const mockingbird = {
        _bindings: __BINDINGS__,
        _mutables: __MUTABLES__,
        _cache: new Map(),
        _set: ${mockingbird._set.toString()},
        _reset: ${mockingbird._reset.toString()},

        mock: ${mockingbird.mock.toString()},
        unmock: ${mockingbird.unmock.toString()},
        resetMock: ${mockingbird.resetMock.toString()},
        unmockAll: ${mockingbird.unmockAll.toString()},
        resetAllMocks: ${mockingbird.resetAllMocks.toString()},
        save: ${mockingbird.save.toString()},
        restore: ${mockingbird.restore.toString()},
        saveAll: ${mockingbird.saveAll.toString()},
        restoreAll: ${mockingbird.restoreAll.toString()},
    }`,
    { sourceType: 'module', placeholderPattern: /^__[_$A-Z0-9]+__$/ } as any,
);

export const buildMockingbird = (bindings: string[], mutables: string[]) => {
    const __BINDINGS__ = t.arrayExpression(bindings.map(id => t.stringLiteral(id)));
    const __MUTABLES__ = t.arrayExpression(mutables.map(id => t.stringLiteral(id)));

    return mockingbirdTemplate({ __BINDINGS__, __MUTABLES__ });
};

export let testOnlyExport1 = {};
export let testOnlyExport2 = {};
let testOnlyLocal = {};
export const getTestOnlyLocal = () => testOnlyLocal;
export const mutateTestOnlyExports = () => {
    testOnlyExport1 = {};
    testOnlyExport2 = {};
};

/* istanbul ignore if */
if (process.env.NODE_ENV === 'test') {
    Object.assign(mockingbird, {
        _bindings: ['testOnlyExport1', 'testOnlyExport2', 'testOnlyLocal', 'getTestOnlyLocal'],
        _mutables: ['testOnlyExport1', 'testOnlyExport2', 'testOnlyLocal'],
    });
}
