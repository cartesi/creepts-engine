# Creepts Game Engine

Creepts is a decentralized tower defense game that showcases [Cartesi](https://cartesi.io).

This repo hosts the Creepts Engine, which is written in a way to abstract the user interface and enables to reproduce the execution of a gameplay without the UI. The engine is mostly written in Typescript and compiled to Javascript (ES2017) during a build process.

## Usage

There are two main classes exposed: `Engine` and `EngineRunner`:

### EngineRunner

The `EngineRunner` can be used by any process that wants to reproduce a gameplay store in a json log file.

```javascript
// create a EngineRunner for a specific level
const runner = new EngineRunner(level);

// run a log, optionally specifying an execution progress callback
const state = runner.run(logs, progress);

// use the engine final state
console.log(state.score);
```

For specifics on how to instantiate the necessary objects for the `EngineRunner` and how to work with it check the source code.

### Engine

The Engine can be used if you need to have more control over the engine execution. You still need to instantiate the Engine with the level information, and then call the `update` method until it reaches the end of the game.

For specifics on how to instantiate the necessary objects for the `Engine` and how to work with it check the source code.

## Build

To get a list of all the available `npm` targets run:

    % npm run info

## Contributing

Thank you for your interest in Cartesi! Head over to our [Contributing Guidelines](CONTRIBUTING.md) for instructions on how to sign our Contributors Agreement and get started with Cartesi!

Please note we have a [Code of Conduct](CODE_OF_CONDUCT.md), please follow it in all your interactions with the project.

## License

This repository and all contributions are licensed under
[APACHE 2.0](https://www.apache.org/licenses/LICENSE-2.0). Please review our [LICENSE](LICENSE) file.

## Acknowledgments

- Original work
