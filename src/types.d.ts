declare module '@babel/core' {
    export * from 'babel-core';
}
declare module '@babel/traverse' {
    export * from 'babel-traverse';
}

interface Mockingbird {
    mock<T>(refName: 'default', mockImplementation?: T): T;
    mock<T>(refName: string, mockImplementation?: T): T;
    unmock(refName: string): any;
    resetMock(refName: string): void;
    unmockAll(): void;
    resetAllMocks(): void;
}
