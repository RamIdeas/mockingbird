# Mockingbird

## Easily mock internal references

This babel plugin was written to lessen the effort to write code _just_ so it is testable.

It, hopefully, let's you write your js modules more naturally while keeping 100% coverage a possibilty.

## Getting Started

Install it from npm:

```bash
npm install babel-plugin-mockingbird
```

Add it to your babelrc **only for test environments**:

```js
const TEST_CONFIG = {
    presets: [
        // ...
    ],
    plugins: [
        // ...
        'babel-plugin-mockingbird',
        // ...
    ],
};

modules.exports = function() {
    if (process.env.NODE_ENV === 'test') return TEST_CONFIG;

    return CONFIG;
};
```

## Reasoning:

Consider this module:

```js
// calculate.js
const add = (a, b) => a + b;
const subtract = (a, b) => a - b;
const multiply = (a, b) => a * b;
const divide = (a, b) => a / b;

export default function calculate(a, b, operator) {
    switch (operator) {
        case '+':
            return add(a, b);
        case '-':
            return subtract(a, b);
        case '*':
            return multiply(a, b);
        case '/':
            return divide(a, b);
    }
}
```

In this contrived example, you could write tests for just `calculate` but, imagining a more complex example, you would ideally write unit-tests for all 5 functions. The "non-ideal" examples below demonstrate the possible avenues devs take to reach this goal.

### Non-ideal option 1:

_Just export the internal functions for testing_, but `calculate`'s tests will still depend on them. ~~It's hard to~~ You can't mock them since `calculate` holds a reference to them.

### Non-ideal option 2:

_Pull the internal functions into another module and mock that._ This can deter devs from abstacting logic from large functions into smaller functions and adds cognitive overhead to anyone reading the code as the logic is no longer co-located. Testing is rather convoluted as you have to reset the module cache, mock the function and then import the module with Node's `require`.

```js
// calculate.js
import add from './add';
import subtract from './subtract';
import multiply from './multiply';
import divide from './divide';

export default function calculate(a, b, operator) {
    switch (operator) {
        case '+':
            return add(a, b);
        case '-':
            return subtract(a, b);
        case '*':
            return multiply(a, b);
        case '/':
            return divide(a, b);
    }
}
```

```js
// add.js
export default (a, b) => a + b;
```

```js
// subtract.js
export default (a, b) => a - b;
```

```js
// multiply.js
export default (a, b) => a * b;
```

```js
// divide.js
export default (a, b) => a / b;
```

```js
// calculate.spec.js
test('add method is called', () => {
    jest.resetModules();
    const addMock = jest.fn();
    jest.mock('add', addMock);
    const calculate = require('./calculate').default;

    calculate(1, 2, '+');

    expect(addMock).toHaveBeenCalledWith(1, 2);

    jest.unmock('add');
});
```

### Non-ideal option 3:

_Add these functions to an object which can be mutated during tests._ This just adds unnecessary complexity to your code -- implementation _and_ tests.

```js
// calculate.js
const add = (a, b) => a + b;
const subtract = (a, b) => a - b;
const multiply = (a, b) => a * b;
const divide = (a, b) => a / b;

export default function calculate(a, b, operator) {
    switch (operator) {
        case '+':
            return internalMethods.add(a, b);
        case '-':
            return internalMethods.subtract(a, b);
        case '*':
            return internalMethods.multiply(a, b);
        case '/':
            return internalMethods.divide(a, b);
    }
}

export const internalMethods = {
    add,
    subtract,
    multiply,
    divide,
};
```

```js
// calculate.spec.js
import calculate, { internalMethods } from './calculate';

const originalMethods = { ...internalMethods };

afterEach(() => {
    Object.assign(internalMethods, originalMethods);
});

test('add method is called', () => {
    internalMethods.add = jest.fn();

    calculate(1, 2, '+');

    expect(internalMethods.add).toHaveBeenCalledWith(1, 2);
});
```

### Non-ideal option 4:

_Inject the functions via optional params._ This also adds unnecessary complexity to your code, but allows cleaner test code, BUT leaks the ability to modify your functions behaviour in actual usage.

```js
// calculate.js
const add = (a, b) => a + b;
const subtract = (a, b) => a - b;
const multiply = (a, b) => a * b;
const divide = (a, b) => a / b;

const _ = { add, subtract, multiply, divide };

export default function calculate(a, b, operator, { add: _.add, subtract: _.subtract, multiply: _.multiply, divide: _.divide }) {
  switch (operator) {
    case "+":
      return add(a, b);
    case "-":
      return subtract(a, b);
    case "*":
      return multiply(a, b);
    case "/":
      return divide(a, b);
  }
}
```

```js
// calculate.spec.js
import calculate, { internalMethods } from './calculate';

test('add method is called', () => {
    const add = jest.fn();

    calculate(1, 2, '+', { add });

    expect(add).toHaveBeenCalledWith(1, 2);
});
```

### Option using Mockingbird:

```ts
// calculate.ts
export declare const mockingbird;

export const add = (a, b) => a + b;
export const subtract = (a, b) => a - b;
export const multiply = (a, b) => a * b;
export const divide = (a, b) => a / b;

export default function calculate(a, b, operator) {
    switch (operator) {
        case '+':
            return add(a, b);
        case '-':
            return subtract(a, b);
        case '*':
            return multiply(a, b);
        case '/':
            return divide(a, b);
    }
}
```

```js
// calculate.spec.js
import calculate, { add, subtract, multiply, divide, mockingbird } from './calculate';

test('add method is called', () => {
    mockingbird.mock('add', jest.fn());

    calculate(1, 2, '+');

    expect(add).toHaveBeenCalledWith(1, 2);
});
```

## Opt In (off by default)

You have to opt-in for each file to get transpiled with babel-plugin-mockingbird. These are the possible opt-in statements:

-   TypeScript (removed by the typescript preset if this plugin is not used)
    -   `export declare const mockingbird: Mockingbird;`
    -   `export declare let mockingbird: Mockingbird;`
    -   `export declare var mockingbird: Mockingbird;`
    -   `export declare const mockingbird;`
    -   `export declare let mockingbird;`
    -   `export declare var mockingbird;`
-   JavaScript (left in place when this plugin is not used but won't cause any issues)
    -   `export let mockingbird;`
    -   `export var mockingbird;`

## How it works

In a nutshell, this plugin:

1. Changes all top-level `const` declarations to `let`
2. Assigns the Mockingbird object to the opt-in declaration

_Note: There shouldn't be any concern around (1), as `let`/`const` have the same semantics other than reassignment which will be caught by Babel during regular builds_

## API

_Coming soon. You can look at the TypeScript definitions for the available methods in the meanwhile._

**Remember to call `mockingbird.unmockAll()` in your `afterEach` to avoid mocks within one test affecting the next.**
