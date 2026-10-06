import { describe, expect, it, vi } from 'vitest';
import {
    destroyPixiContainerChildren,
    destroyPixiDisplayTree,
    setPixiDisplayTreeVisibility,
    unloadPixiDisplayTree,
    type PixiDisplayNode,
} from './pixiDisplayResources';

/**
 * These three helpers are the difference between "the scene cache is hidden" and "its GPU buffers
 * were released": a hidden subtree keeps its display objects so seeking backwards is free, but it
 * must not keep holding batcher buffers, and it must not release them twice.
 */

type Tracked = PixiDisplayNode & {
    name: string;
    unloads: number;
    contextUnloads: number;
    destroys: number;
    destroyArgs?: unknown[];
};

const node = (name: string, children: Tracked[] = []): Tracked => {
    const tracked: Tracked = {
        name,
        children,
        unloads: 0,
        contextUnloads: 0,
        destroys: 0,
    };
    tracked.unload = () => { tracked.unloads += 1; };
    tracked.context = { unload: () => { tracked.contextUnloads += 1; } };
    // Records the arguments on purpose: Pixi 8's Graphics only destroys a self-built
    // GraphicsContext when destroy() is called with no options at all.
    tracked.destroy = (...args: unknown[]) => {
        tracked.destroys += 1;
        tracked.destroyArgs = args;
    };
    return tracked;
};

const child = node('child');
const grandchild = node('grandchild');
const parent = node('parent', [child, grandchild]);

describe('unloadPixiDisplayTree', () => {
    it('unloads every descendant view and context view, but not the root itself', () => {
        unloadPixiDisplayTree(parent);
        expect(child.unloads).toBe(1);
        expect(child.contextUnloads).toBe(1);
        expect(grandchild.unloads).toBe(1);
        expect(grandchild.contextUnloads).toBe(1);
        // The root is the retained node; hiding its children must not touch it.
        expect(parent.unloads).toBe(0);
        expect(parent.contextUnloads).toBe(0);
    });
});

describe('setPixiDisplayTreeVisibility', () => {
    it('releases resources exactly once when the tree leaves the visible set', () => {
        const leaf = node('leaf');
        const tree = node('tree', [leaf]);
        setPixiDisplayTreeVisibility(tree, false);
        expect(tree.visible).toBe(false);
        expect(leaf.unloads).toBe(1);

        // Still hidden: a second hide must not unload again (the buffers are already released).
        setPixiDisplayTreeVisibility(tree, false);
        expect(leaf.unloads).toBe(1);
    });

    it('leaves resources alone when the tree becomes visible', () => {
        const leaf = node('leaf');
        const tree = node('tree', [leaf]);
        setPixiDisplayTreeVisibility(tree, true);
        expect(tree.visible).toBe(true);
        expect(leaf.unloads).toBe(0);
    });
});

describe('destroyPixiDisplayTree', () => {
    it('destroys children before their parent and passes no options', () => {
        const order: string[] = [];
        const leaf = node('leaf');
        leaf.destroy = () => { order.push('leaf'); };
        const branch = node('branch', [leaf]);
        branch.destroy = () => { order.push('branch'); };
        const root = node('root', [branch]);

        destroyPixiDisplayTree(root);
        // Depth-first, then reversed: every child is gone before its parent is destroyed.
        expect(order).toEqual(['leaf', 'branch']);
        expect(root.destroys).toBe(1);
        // No `{ children: true }`: Container would forward it, and Graphics would then skip
        // destroying the GraphicsContext it owns.
        expect(branch.destroyArgs ?? []).toEqual([]);
    });

    it('tolerates nodes without a destroy implementation', () => {
        const bare: PixiDisplayNode = { children: [{}, { children: [{}] }] };
        expect(() => destroyPixiDisplayTree(bare)).not.toThrow();
    });
});

describe('destroyPixiContainerChildren', () => {
    it('destroys each detached child subtree', () => {
        const one = node('one');
        const two = node('two', [node('two-child')]);
        const container = {
            removeChildren: vi.fn(() => [one, two]),
        };

        const twoChild = two.children![0] as Tracked;
        destroyPixiContainerChildren(container);
        expect(container.removeChildren).toHaveBeenCalledTimes(1);
        expect(one.destroys).toBe(1);
        expect(two.destroys).toBe(1);
        expect(twoChild.destroys).toBe(1);
    });
});
