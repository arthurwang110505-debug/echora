// src/components/visualizer/sonnet/sonnetAnimatedGraphics.ts
// Records Graphics commands so strokes/fills can grow with the shared stagger
// schedule during playback instead of appearing fully drawn at scene build.
type PixiModule = typeof import('pixi.js');
type GraphicsTarget = import('pixi.js').Graphics;

type AnimatedCommand = {
    type: 'stroke' | 'fill';
    path: any[];
    length: number;
    options: any;
    staggerDelay?: number;
    staggerSpan?: number;
};

export class AnimatedGraphics {
    // Keep a stable Container surface so completed commands can stay rasterized while
    // the active command layer continues to animate. Both layers preserve the same
    // visual object, mask, transform, and draw order contract for callers.
    public display: import('pixi.js').Container;

    private readonly staticDisplay: GraphicsTarget;
    private readonly activeDisplay: GraphicsTarget;
    private commands: AnimatedCommand[] = [];
    private currentPath: any[] = [];
    private currentLength = 0;
    private lastX = 0;
    private lastY = 0;
    private staggerScheduled = false;
    private staticPrefixCount = 0;
    private lastRawProgress: number | null = null;

    constructor(pixi: PixiModule) {
        this.display = new pixi.Container();
        this.staticDisplay = new pixi.Graphics();
        this.activeDisplay = new pixi.Graphics();
        this.display.addChild(this.staticDisplay, this.activeDisplay);
    }

    get rotation() { return this.display.rotation; }
    set rotation(v: number) { this.display.rotation = v; }

    get mask() { return this.display.mask; }
    set mask(v: any) { this.display.mask = v; }

    moveTo(x: number, y: number) {
        this.currentPath.push({ type: 'moveTo', x, y });
        this.lastX = x;
        this.lastY = y;
        return this;
    }

    lineTo(x: number, y: number) {
        const len = Math.hypot(x - this.lastX, y - this.lastY);
        this.currentPath.push({ type: 'lineTo', x, y, len, lastX: this.lastX, lastY: this.lastY });
        this.currentLength += len;
        this.lastX = x;
        this.lastY = y;
        return this;
    }

    quadraticCurveTo(cx: number, cy: number, tx: number, ty: number) {
        const len = Math.hypot(cx - this.lastX, cy - this.lastY) + Math.hypot(tx - cx, ty - cy);
        this.currentPath.push({ type: 'quadraticCurveTo', cx, cy, tx, ty, len, lastX: this.lastX, lastY: this.lastY });
        this.currentLength += len;
        this.lastX = tx;
        this.lastY = ty;
        return this;
    }

    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, tx: number, ty: number) {
        const len = Math.hypot(c1x - this.lastX, c1y - this.lastY)
            + Math.hypot(c2x - c1x, c2y - c1y)
            + Math.hypot(tx - c2x, ty - c2y);
        this.currentPath.push({ type: 'bezierCurveTo', c1x, c1y, c2x, c2y, tx, ty, len, lastX: this.lastX, lastY: this.lastY });
        this.currentLength += len;
        this.lastX = tx;
        this.lastY = ty;
        return this;
    }

    arc(cx: number, cy: number, r: number, start: number, end: number, anticlockwise = false) {
        let diff = end - start;
        if (anticlockwise && diff > 0) diff -= Math.PI * 2;
        else if (!anticlockwise && diff < 0) diff += Math.PI * 2;
        const len = Math.abs(diff) * r;
        this.currentPath.push({ type: 'arc', cx, cy, r, start, end, anticlockwise, len, diff });
        this.currentLength += len;
        this.lastX = cx + Math.cos(end) * r;
        this.lastY = cy + Math.sin(end) * r;
        return this;
    }

    circle(x: number, y: number, r: number) {
        // Randomize the start angle and direction to give organic variance (avoiding uniform "drawn from the right" look)
        const start = Math.random() * Math.PI * 2;
        const anticlockwise = Math.random() > 0.5;
        const diff = anticlockwise ? -Math.PI * 2 : Math.PI * 2;
        const len = Math.PI * 2 * r;
        const startX = x + Math.cos(start) * r;
        const startY = y + Math.sin(start) * r;

        this.moveTo(startX, startY);
        this.currentPath.push({ type: 'arc', cx: x, cy: y, r, start, end: start + diff, anticlockwise, len, diff });
        this.currentLength += len;
        this.lastX = x + Math.cos(start + diff) * r;
        this.lastY = y + Math.sin(start + diff) * r;
        return this;
    }

    rect(x: number, y: number, w: number, h: number) {
        this.currentPath.push({ type: 'rect_hint', x, y, w, h });
        this.moveTo(x, y).lineTo(x + w, y).lineTo(x + w, y + h).lineTo(x, y + h).lineTo(x, y);
        return this;
    }

    stroke(options: any) {
        if (this.currentPath.length > 0) {
            this.commands.push({ type: 'stroke', path: [...this.currentPath], length: this.currentLength, options });
            this.currentPath = [];
            this.currentLength = 0;
        }
        return this;
    }

    fill(options: any) {
        if (this.currentPath.length > 0) {
            this.commands.push({ type: 'fill', path: [...this.currentPath], length: this.currentLength, options });
            this.currentPath = [];
            this.currentLength = 0;
        }
        return this;
    }

    // Assigns each stroke/fill its own deterministic time window so growth layers
    // across the whole shot instead of everything finishing together. Golden-ratio
    // slots spread the start times evenly (no aliasing clusters), per-command jitter
    // varies the durations, and every span is clamped so all commands complete
    // exactly at progress 1. Pure function of command order — seek-safe.
    private scheduleStagger() {
        const GOLDEN = 0.6180339887498949;
        let strokeIndex = 0;
        let fillIndex = 0;
        for (const cmd of this.commands) {
            const isStroke = cmd.type === 'stroke';
            const index = isStroke ? strokeIndex++ : fillIndex++;
            const slot = (index * GOLDEN) % 1;
            const jitter = ((index * 2654435761) >>> 0) / 4294967296;
            const delay = slot * (isStroke ? 0.5 : 0.45);
            const span = isStroke ? 0.32 + jitter * 0.26 : 0.4 + jitter * 0.25;
            cmd.staggerDelay = delay;
            cmd.staggerSpan = Math.min(span, 1 - delay);
        }
        this.staggerScheduled = true;
    }

    private drawPath(target: GraphicsTarget, path: any[], targetLen: number) {
        let currentLen = 0;
        for (const p of path) {
            if (p.type === 'rect_hint') continue;
            if (p.type === 'moveTo') {
                target.moveTo(p.x, p.y);
                continue;
            }
            if (currentLen >= targetLen) break;

            if (currentLen + p.len <= targetLen) {
                if (p.type === 'lineTo') target.lineTo(p.x, p.y);
                else if (p.type === 'circle') target.circle(p.x, p.y, p.r);
                else if (p.type === 'arc') target.arc(p.cx, p.cy, p.r, p.start, p.end, p.anticlockwise);
                else if (p.type === 'quadraticCurveTo') target.quadraticCurveTo(p.cx, p.cy, p.tx, p.ty);
                else if (p.type === 'bezierCurveTo') target.bezierCurveTo(p.c1x, p.c1y, p.c2x, p.c2y, p.tx, p.ty);
                currentLen += p.len;
                continue;
            }

            const ratio = p.len > 0 ? (targetLen - currentLen) / p.len : 0;
            if (p.type === 'lineTo') {
                const x = p.lastX + (p.x - p.lastX) * ratio;
                const y = p.lastY + (p.y - p.lastY) * ratio;
                target.lineTo(x, y);
            } else if (p.type === 'circle') {
                target.arc(p.x, p.y, p.r, 0, Math.PI * 2 * ratio);
            } else if (p.type === 'arc') {
                target.arc(p.cx, p.cy, p.r, p.start, p.start + p.diff * ratio, p.anticlockwise);
            } else if (p.type === 'quadraticCurveTo') {
                const newCpX = p.lastX + ratio * (p.cx - p.lastX);
                const newCpY = p.lastY + ratio * (p.cy - p.lastY);
                const newTx = (1 - ratio) * (1 - ratio) * p.lastX + 2 * (1 - ratio) * ratio * p.cx + ratio * ratio * p.tx;
                const newTy = (1 - ratio) * (1 - ratio) * p.lastY + 2 * (1 - ratio) * ratio * p.cy + ratio * ratio * p.ty;
                target.quadraticCurveTo(newCpX, newCpY, newTx, newTy);
            } else if (p.type === 'bezierCurveTo') {
                const q0x = p.lastX + ratio * (p.c1x - p.lastX);
                const q0y = p.lastY + ratio * (p.c1y - p.lastY);
                const q1x = p.c1x + ratio * (p.c2x - p.c1x);
                const q1y = p.c1y + ratio * (p.c2y - p.c1y);
                const q2x = p.c2x + ratio * (p.tx - p.c2x);
                const q2y = p.c2y + ratio * (p.ty - p.c2y);
                const r0x = q0x + ratio * (q1x - q0x);
                const r0y = q0y + ratio * (q1y - q0y);
                const r1x = q1x + ratio * (q2x - q1x);
                const r1y = q1y + ratio * (q2y - q1y);
                const bx = r0x + ratio * (r1x - r0x);
                const by = r0y + ratio * (r1y - r0y);
                target.bezierCurveTo(q0x, q0y, r0x, r0y, bx, by);
            }
            break;
        }
    }

    private drawCommand(target: GraphicsTarget, cmd: AnimatedCommand, rawProgress: number) {
        const localRaw = Math.min(
            1,
            Math.max(0, (rawProgress - (cmd.staggerDelay ?? 0)) / Math.max(cmd.staggerSpan ?? 1, 0.001)),
        );
        if (localRaw <= 0) return;

        const localProgress = 1 - Math.pow(1 - localRaw, 3);
        if (cmd.type === 'fill') {
            target.moveTo(0, 0);
            const isRectWipe = cmd.path.length === 6 && cmd.path[0]?.type === 'rect_hint';
            if (isRectWipe) {
                const rect = cmd.path[0];
                target.rect(rect.x, rect.y, rect.w * localProgress, rect.h);
            } else {
                for (const p of cmd.path) {
                    if (p.type === 'rect_hint') continue;
                    if (p.type === 'moveTo') target.moveTo(p.x, p.y);
                    else if (p.type === 'lineTo') target.lineTo(p.x, p.y);
                    else if (p.type === 'circle') target.circle(p.x, p.y, p.r);
                    else if (p.type === 'arc') target.arc(p.cx, p.cy, p.r, p.start, p.end, p.anticlockwise);
                    else if (p.type === 'quadraticCurveTo') target.quadraticCurveTo(p.cx, p.cy, p.tx, p.ty);
                    else if (p.type === 'bezierCurveTo') target.bezierCurveTo(p.c1x, p.c1y, p.c2x, p.c2y, p.tx, p.ty);
                }
            }
            const alphaProgress = 1 - Math.pow(1 - Math.min(1, localRaw * 2), 3);
            target.fill({ ...cmd.options, alpha: (cmd.options.alpha ?? 1) * alphaProgress });
            return;
        }

        if (cmd.length <= 0) return;
        this.drawPath(target, cmd.path, cmd.length * localProgress);
        target.stroke(cmd.options);
    }

    private rebuildStaticLayer(prefixCount: number) {
        this.staticDisplay.clear();
        for (let index = 0; index < prefixCount; index += 1) {
            this.drawCommand(this.staticDisplay, this.commands[index]!, 1);
        }
    }

    update(rawProgress: number) {
        if (!this.staggerScheduled) this.scheduleStagger();
        const safeProgress = Number.isFinite(rawProgress) ? Math.min(1, Math.max(0, rawProgress)) : 0;

        // Direct seeks can move backward. Invalidate only the completed-command cache;
        // the deterministic command schedule still produces the same frame afterward.
        if (this.lastRawProgress !== null && safeProgress < this.lastRawProgress - 0.0001) {
            this.staticPrefixCount = 0;
            this.staticDisplay.clear();
        }
        this.lastRawProgress = safeProgress;

        let prefixCount = 0;
        for (const cmd of this.commands) {
            const localRaw = Math.min(
                1,
                Math.max(0, (safeProgress - (cmd.staggerDelay ?? 0)) / Math.max(cmd.staggerSpan ?? 1, 0.001)),
            );
            if (localRaw < 1) break;
            prefixCount += 1;
        }
        if (prefixCount !== this.staticPrefixCount) {
            this.staticPrefixCount = prefixCount;
            this.rebuildStaticLayer(prefixCount);
        }

        // Keep all commands after the cached prefix in their original order. This
        // preserves overlap/z-order while only replaying the still-changing suffix.
        this.activeDisplay.clear();
        for (let index = prefixCount; index < this.commands.length; index += 1) {
            this.drawCommand(this.activeDisplay, this.commands[index]!, safeProgress);
        }
    }
}
