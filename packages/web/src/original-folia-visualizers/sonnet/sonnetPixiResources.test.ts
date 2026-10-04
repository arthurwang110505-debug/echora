import { describe, expect, it, vi } from 'vitest';
import * as pixi from 'pixi.js';
import { SonnetPixiRuntime } from './createSonnetPixiRuntime';
import {
    destroySonnetContainerChildren,
    destroySonnetDisplayTree,
    unloadSonnetDisplayTree,
} from './sonnetPixiResources';

type TestNode = {
    children?: TestNode[];
    destroy?: () => void;
};

const buildTree = () => {
    const shared = new pixi.GraphicsContext().rect(0, 0, 10, 10).fill({ color: 0xffffff });
    const owned = new pixi.Graphics().moveTo(0, 0).lineTo(40, 40).stroke({ width: 2, color: 0xffffff });
    const deep = new pixi.Graphics().moveTo(0, 0).lineTo(20, 20).stroke({ width: 2, color: 0xffffff });
    const sharer = new pixi.Graphics(shared);
    const texture = new pixi.Texture();
    const sprite = new pixi.Sprite(texture);
    const root = new pixi.Container();
    const branch = new pixi.Container();
    const leafHolder = new pixi.Container();
    leafHolder.addChild(deep);
    branch.addChild(sharer, leafHolder, sprite);
    root.addChild(owned, branch);
    return {
        root,
        branch,
        shared,
        owned,
        deep,
        sharer,
        texture,
        sprite,
        ownedContexts: [owned.context, deep.context],
    };
};

describe('Sonnet Pixi resource lifecycle', () => {
    it('destroys owned GraphicsContexts child-first without destroying shared contexts or textures', () => {
        const tree = buildTree();

        destroySonnetDisplayTree(tree.root);

        expect(tree.ownedContexts.every(context => context.destroyed)).toBe(true);
        expect(tree.shared.destroyed).toBe(false);
        expect(tree.texture.destroyed).toBe(false);
        expect([tree.root, tree.branch, tree.owned, tree.deep, tree.sharer, tree.sprite]
            .every(node => node.destroyed)).toBe(true);
    });

    it('destroys detached container children but leaves the container itself intact', () => {
        const tree = buildTree();
        const holder = new pixi.Container();
        holder.addChild(tree.root);

        destroySonnetContainerChildren(holder);

        expect(holder.destroyed).toBe(false);
        expect(holder.children).toHaveLength(0);
        expect(tree.ownedContexts.every(context => context.destroyed)).toBe(true);
        expect(tree.shared.destroyed).toBe(false);
    });

    it('unloads GraphicsContext geometry for a retained tree before it is shown again', () => {
        const tree = buildTree();
        const unloads = [...tree.ownedContexts, tree.shared].map(context => vi.spyOn(context, 'unload'));

        unloadSonnetDisplayTree(tree.root);

        unloads.forEach(unload => expect(unload).toHaveBeenCalledOnce());
        expect(tree.ownedContexts.every(context => !context.destroyed && context.instructions.length > 0)).toBe(true);
        destroySonnetDisplayTree(tree.root);
    });

    it('releases a Sonnet scene\'s owned GraphicsContexts when pruning it', () => {
        const tree = buildTree();
        const sceneContainer = new pixi.Container();
        sceneContainer.addChild(tree.root);
        const runtime = Object.assign(Object.create(SonnetPixiRuntime.prototype), {
            sceneContainer,
            outroBlurScene: null,
        });
        const scene = { container: tree.root, shots: [{ haloLayer: tree.branch }], postProcessFilters: [] };

        (runtime as unknown as { destroyScene: (value: unknown) => void }).destroyScene(scene);

        expect(sceneContainer.children).toHaveLength(0);
        expect(tree.ownedContexts.every(context => context.destroyed)).toBe(true);
        expect(tree.shared.destroyed).toBe(false);
    });

    it('invokes destroy on descendants before their parent', () => {
        const order: string[] = [];
        const leaf: TestNode = { destroy: () => order.push('leaf') };
        const branch: TestNode = { children: [leaf], destroy: () => order.push('branch') };
        const root: TestNode = { children: [branch], destroy: () => order.push('root') };

        destroySonnetDisplayTree(root);

        expect(order).toEqual(['leaf', 'branch', 'root']);
    });
});
