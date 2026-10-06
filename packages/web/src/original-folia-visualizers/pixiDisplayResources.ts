// Ported from Project Folia (AGPL-3.0) — https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/pixiDisplayResources.ts
//
// Releases renderer-owned data without discarding display trees that must remain seekable.

export interface PixiDisplayNode {
    children?: PixiDisplayNode[];
    visible?: boolean;
    /** A Graphics' GraphicsContext: large (non-batched) contexts each hold a batcher and its buffers. */
    context?: { unload?: () => void };
    unload?: () => void;
    destroy?: () => void;
}

export const unloadPixiDisplayTree = (root: PixiDisplayNode) => {
    const stack = [...(root.children ?? [])];
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.children?.length) stack.push(...node.children);
        // `Graphics.unload()` only drops the view's own batch data; the buffers hang off the
        // context and have to be unloaded separately. Drawing into it again rebuilds and re-uploads
        // automatically. A shared context is merely forced to upload once more - it never draws wrong.
        node.context?.unload?.();
        node.unload?.();
    }
};

/** Unloads descendants exactly once when a retained Pixi tree leaves the visible set. */
export const setPixiDisplayTreeVisibility = (root: PixiDisplayNode, visible: boolean) => {
    const wasVisible = root.visible !== false;
    root.visible = visible;
    if (wasVisible && !visible) unloadPixiDisplayTree(root);
};

/**
 * Destroys a whole display tree, Graphics' self-built GraphicsContext included, while leaving a
 * context that was passed into the constructor alone.
 *
 * `destroy({ children: true })` cannot be used: Container hands that option straight down to every
 * child, and Pixi 8's Graphics.destroy only destroys a self-built context when it receives an
 * options object *without* `context: true` - in which case its GPU batch data waits for Pixi's GC
 * (about 60 seconds of idle). Passing `context: true` would destroy a shared context as well. So
 * every node is destroyed without arguments: that is the one path where Graphics destroys a
 * context it owns, and for every other node the no-argument call is the same as `{ children: true }`
 * without touching textures.
 */
export const destroyPixiDisplayTree = (root: PixiDisplayNode) => {
    // Collect depth-first, destroy in reverse: children always come before their parent, so by the
    // time a parent is destroyed it has no children left to handle.
    const order: PixiDisplayNode[] = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop()!;
        order.push(node);
        if (node.children?.length) stack.push(...node.children);
    }
    for (let index = order.length - 1; index >= 0; index -= 1) order[index]!.destroy?.();
};

/** `removeChildren()` only detaches nodes; explicitly unload and destroy the detached subtrees. */
export const destroyPixiContainerChildren = (container: PixiDisplayNode & {
    removeChildren: () => PixiDisplayNode[];
}) => {
    container.removeChildren().forEach(destroyPixiDisplayTree);
};
