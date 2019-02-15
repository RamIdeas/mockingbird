const CONFIG = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-react',
        '@babel/preset-typescript',
    ],
    plugins: ['@babel/plugin-proposal-object-rest-spread', '@babel/plugin-proposal-class-properties'],
};

const TEST_CONFIG = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-react',
        '@babel/preset-typescript',
        // 'jest',
    ],
    plugins: [
        'babel-plugin-dynamic-import-node', // only for tests, otherwise webpack handles
        '@babel/plugin-transform-async-to-generator', // only for tests, because jest global.Promise doesn't match async function return type
        '@babel/plugin-proposal-object-rest-spread',
        '@babel/plugin-proposal-class-properties',
        'babel-plugin-jest-hoist',
    ],
};

function generate(api) {
    api && api.cache.never();

    if (process.env.NODE_ENV === 'test') return TEST_CONFIG;

    return CONFIG;
}

module.exports = generate();
