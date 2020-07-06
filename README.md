# Minecraft Launcher -- Electron/Node.js

A Minecraft Launcher made with electron/node.js.

## Note that *everything* is subject to change.

## Progress

This project is in WIP status. Here are the current goals for the project:
- [x] Parallel download handler for faster download speeds as minecraft assets are tiny and a lot in amount.
- [ ] Structuring the [game files](https://wiki.vg/Game_files).
    - [x] Creating list of files.
    - [x] Extracting `natives`.
    - [ ] Better parsing for `rules`, actually not better, the method is wrong and I should fix it.
    - [ ] Preparing command line arguments to run the game.
        - [x] Basic command line arguments JUST to run the game.
        - [ ] Add additional JVM args from jvm rules.
    - [ ] Add compatibility with versions older than 1.6.
- [x] File check system. Probably will write again from scratch to optimize the flow.
- [ ] Logging system with `log4js`.
- [ ] Making a ui to launch the game using `spectre.css`.
- [ ] Implementing auth system.
- [ ] Add configurable options
    - [x] Downloading thread amount.
    - [ ] More...
- [ ] Publish the code as soon as the game can run.
- [ ] Implement testing with [codecov.io](https://codecov.io)
