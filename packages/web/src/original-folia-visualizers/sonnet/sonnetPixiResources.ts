type SonnetDisplayNode = {
    children?: SonnetDisplayNode[];
    context?: { unload?: () => void };
    unload?: () => void;
    destroy?: () => void;
};

// Release GPU-side data while keeping the display tree reusable for a later seek.
export const unloadSonnetDisplayTree = (root: SonnetDisplayNode) => {
    const stack = [...(root.children ?? [])];
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.children?.length) stack.push(...node.children);
        // Graphics.unload() releases its view data; its geometry buffers belong to the context.
        node.context?.unload?.();
        node.unload?.();
    }
};

/**
 * Destroy a display tree child-first, without passing options to Pixi objects.
 * In Pixi 8, Container.destroy({ children: true }) forwards the options object to Graphics;
 * Graphics then leaves its owned GraphicsContext buffers for the delayed renderer GC.
 * Calling each node's destroy() without options releases owned contexts immediately while
 * preserving contexts shared with other Graphics and textures owned by the texture pool.
 */
export const destroySonnetDisplayTree = (root: SonnetDisplayNode) => {
    const order: SonnetDisplayNode[] = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop()!;
        order.push(node);
        if (node.children?.length) stack.push(...node.children);
    }
    for (let index = order.length - 1; index >= 0; index -= 1) {
        order[index]!.destroy?.();
    }
};

// removeChildren() only detaches nodes; destroy each detached tree and its owned GraphicsContexts.
export const destroySonnetContainerChildren = (container: SonnetDisplayNode & {
    removeChildren: () => SonnetDisplayNode[];
}) => {
    container.removeChildren().forEach(destroySonnetDisplayTree);
};
