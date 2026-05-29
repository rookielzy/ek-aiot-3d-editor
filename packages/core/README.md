# @ek-aiot/3d-editor-core

Core owns the editor contract: scene snapshots, commands, history, asset references, runtime projection, serialization, restore, and disposal.

Use `createEditor()` to create a framework-neutral editor, dispatch commands, subscribe to snapshots, mount a runtime into a DOM container, and serialize or restore state.
