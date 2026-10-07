// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereSongSwap.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
// src/components/visualizer/lumiere/lumiereSongSwap.ts
// 換歌交接的兩幀狀態機（同 tempera 的 songSwap）：第一幀在舊歌還在畫的時候把新歌當前段落的場景建好
// （stage），第二幀切過去（commit）。切的那一幀不做任何重活；中途被取消（abort）或運行時銷燬時立即了結，
// 等交接的 promise 一定會 settle，pixiRuntimeHost 的 drain 循環不會掛住。

export interface LumiereSongSwapHooks<TSong, TStaged> {
    /** 離屏建好新歌的場景；沒有可建的返回 null。 */
    stage: (song: TSong) => TStaged | null;
    /** 切到新歌；staged 為 null 時由調用方自己重建。 */
    commit: (song: TSong, staged: TStaged | null) => void;
    /** 銷燬一個不會再被採用的 staged。 */
    discard: (staged: TStaged) => void;
}

interface PendingSwap<TSong, TStaged> {
    song: TSong;
    staged: TStaged | null;
    prepared: boolean;
    settle: () => void;
    detachAbort: () => void;
}

export class LumiereSongSwap<TSong, TStaged> {
    private pending: PendingSwap<TSong, TStaged> | null = null;

    constructor(private readonly hooks: LumiereSongSwapHooks<TSong, TStaged>) { }

    get active() {
        return this.pending !== null;
    }

    /** 已經建好、還沒切過去的場景（tuning / 尺寸變化時需要一起更新或丟棄）。 */
    get staged() {
        return this.pending?.staged ?? null;
    }

    /** 丟掉已建好的 staged（它是按舊的尺寸 / tuning 建的）；交接照常在下一幀切，切的時候重建。 */
    dropStaged() {
        const pending = this.pending;
        if (!pending?.staged) return;
        this.hooks.discard(pending.staged);
        pending.staged = null;
    }

    /** 開始一次交接，兩幀之後 resolve。 */
    begin(song: TSong, signal?: AbortSignal): Promise<void> {
        return new Promise<void>(resolve => {
            const onAbort = () => this.settle(true);
            this.pending = {
                song,
                staged: null,
                prepared: false,
                settle: resolve,
                detachAbort: () => signal?.removeEventListener('abort', onAbort),
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    /** 每幀開頭調用：第一幀 stage，第二幀 commit。 */
    advance() {
        const pending = this.pending;
        if (!pending) return;
        if (!pending.prepared) {
            pending.prepared = true;
            pending.staged = this.hooks.stage(pending.song);
            return;
        }
        this.settle(true);
    }

    /** 立即了結：commit 為 false（運行時正在銷燬）時只丟棄 staged。 */
    settle(commit: boolean) {
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        pending.detachAbort();
        if (commit) this.hooks.commit(pending.song, pending.staged);
        else if (pending.staged) this.hooks.discard(pending.staged);
        pending.settle();
    }
}
