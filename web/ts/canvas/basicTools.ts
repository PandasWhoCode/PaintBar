// ============================================================
// Basic drawing tools: Pencil, Eraser, Spray, Fill, Text
// ============================================================

import { GenericTool } from './genericTool';
import type { Point, TextState, ModalDragState, RGBA } from '../shared/types';
import type { PaintBar } from './app';

export class PencilTool extends GenericTool {
    constructor(paintBar: PaintBar) {
        super(paintBar);
        this.lastX = 0;
        this.lastY = 0;
    }

    onMouseDown(point: Point): void {
        super.onMouseDown(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseMove(point: Point): void {
        if (!this.isDrawing) return;
        this.draw(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseUp(point: Point): void {
        if (!this.isDrawing) return;
        this.draw(point);
        super.onMouseUp(point);
    }

    private draw(point: Point): void {
        const ctx = this.getContext();
        this.applyBrushSettings(ctx);

        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }
}

export class EraserTool extends GenericTool {
    constructor(paintBar: PaintBar) {
        super(paintBar);
        this.lastX = 0;
        this.lastY = 0;
    }

    onMouseDown(point: Point): void {
        super.onMouseDown(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseMove(point: Point): void {
        if (!this.isDrawing) return;
        this.erase(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseUp(point: Point): void {
        if (!this.isDrawing) return;
        this.erase(point);
        super.onMouseUp(point);
    }

    private erase(point: Point): void {
        const ctx = this.getContext();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = this.paintBar.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }
}

export class SprayTool extends GenericTool {
    constructor(paintBar: PaintBar) {
        super(paintBar);
        this.lastX = 0;
        this.lastY = 0;
    }

    onMouseDown(point: Point): void {
        super.onMouseDown(point);
        this.lastX = point.x;
        this.lastY = point.y;
        this.drawSpray(point);
    }

    onMouseMove(point: Point): void {
        if (!this.isDrawing) return;
        this.drawSpray(point);
        this.lastX = point.x;
        this.lastY = point.y;
    }

    onMouseUp(point: Point): void {
        if (!this.isDrawing) return;
        this.drawSpray(point);
        super.onMouseUp(point);
    }

    private drawSpray(point: Point): void {
        const ctx = this.getContext();
        const density = 30;
        const radius = this.paintBar.lineWidth * 2;

        ctx.fillStyle = this.paintBar.currentColor;

        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radiusRandom = Math.random() * radius;
            const sprayX = point.x + Math.cos(angle) * radiusRandom;
            const sprayY = point.y + Math.sin(angle) * radiusRandom;

            ctx.beginPath();
            ctx.arc(sprayX, sprayY, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

export class FillTool extends GenericTool {
    constructor(paintBar: PaintBar) {
        super(paintBar);
    }

    onMouseDown(point: Point): void {
        this.fill(point);
    }

    onMouseMove(_point: Point): void {
        // Fill tool operates on single clicks
    }

    onMouseUp(_point: Point): void {
        // Fill tool operates on single clicks
    }

    private fill(point: Point): void {
        const ctx = this.getContext();
        const imageData = ctx.getImageData(0, 0, this.paintBar.canvas.width, this.paintBar.canvas.height);

        // Save a copy for undo
        const undoState = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );
        this.paintBar.undoStack.push(undoState);
        if (this.paintBar.undoStack.length > this.paintBar.maxUndoStates) {
            this.paintBar.undoStack.shift();
        }
        this.paintBar.redoStack = [];

        const pixels = imageData.data;
        const x = Math.round(point.x);
        const y = Math.round(point.y);

        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return;
        }

        const startPos = (y * imageData.width + x) * 4;
        const startColor = {
            r: pixels[startPos],
            g: pixels[startPos + 1],
            b: pixels[startPos + 2],
            a: pixels[startPos + 3],
        };

        const fillColor = this.hexToRGBA(this.paintBar.currentColor);
        if (!fillColor) return;

        const stack: [number, number][] = [[x, y]];
        const width = imageData.width;
        const height = imageData.height;
        const visited = new Set<string>();

        const isSimilarColor = (pos: number): boolean => {
            const targetAlpha = pixels[pos + 3];

            if (startColor.a < 128) {
                return targetAlpha < 128;
            }

            if (targetAlpha >= 128) {
                const dr = pixels[pos] - startColor.r;
                const dg = pixels[pos + 1] - startColor.g;
                const db = pixels[pos + 2] - startColor.b;
                return (dr * dr + dg * dg + db * db) <= 1600;
            }

            return false;
        };

        while (stack.length > 0) {
            const [px, py] = stack.pop()!;

            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            const key = `${px},${py}`;
            if (visited.has(key)) continue;

            const pos = (py * width + px) * 4;
            if (!isSimilarColor(pos)) continue;

            visited.add(key);

            pixels[pos] = fillColor.r;
            pixels[pos + 1] = fillColor.g;
            pixels[pos + 2] = fillColor.b;
            pixels[pos + 3] = fillColor.a * 255;

            stack.push(
                [px + 1, py],
                [px - 1, py],
                [px, py + 1],
                [px, py - 1],
                [px + 1, py + 1],
                [px - 1, py - 1],
                [px + 1, py - 1],
                [px - 1, py + 1]
            );
        }

        ctx.putImageData(imageData, 0, 0);
    }

    private hexToRGBA(hex: string): RGBA | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: 1,
        } : null;
    }
}

export class TextTool extends GenericTool {
    private textState: TextState;
    private modalDrag: ModalDragState;

    constructor(paintBar: PaintBar) {
        super(paintBar);
        this.textState = {
            text: '',
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#000000',
            rotation: 0,
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            x: 0,
            y: 0,
        };
        this.modalDrag = {
            active: false,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0,
        };
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        const textModal = document.getElementById('textModal');
        const modalHeader = textModal?.querySelector('.modal-header');
        const closeBtn = document.getElementById('closeTextBtn');
        const applyBtn = document.getElementById('applyTextBtn');
        const cancelBtn = document.getElementById('cancelTextBtn');

        if (modalHeader) {
            modalHeader.addEventListener('mousedown', (e) => this.startDragging(e as MouseEvent));
            modalHeader.addEventListener('touchstart', (e) => this.startDragging(e as TouchEvent), { passive: false });

            document.addEventListener('mousemove', (e) => this.drag(e));
            document.addEventListener('touchmove', (e) => this.drag(e), { passive: false });
            document.addEventListener('mouseup', () => this.stopDragging());
            document.addEventListener('touchend', () => this.stopDragging());
        }

        if (closeBtn) {
            closeBtn.onclick = () => this.hideTextControls();
        }
        if (applyBtn) {
            applyBtn.onclick = () => this.applyText();
        }
        if (cancelBtn) {
            cancelBtn.onclick = () => this.hideTextControls();
        }

        const textInput = document.getElementById('textInput') as HTMLTextAreaElement | null;
        const fontFamily = document.getElementById('fontFamily') as HTMLSelectElement | null;
        const fontSize = document.getElementById('fontSize') as HTMLInputElement | null;
        const textColor = document.getElementById('textColor') as HTMLInputElement | null;
        const textRotation = document.getElementById('textRotation') as HTMLInputElement | null;
        const rotationValue = document.getElementById('rotationValue') as HTMLInputElement | null;

        const updatePreview = (): void => {
            const text = textInput?.value || '';
            const font = fontFamily?.value || this.textState.fontFamily;
            const size = parseInt(fontSize?.value || '20');
            const color = textColor?.value || '#000000';
            const rotation = parseInt(textRotation?.value || '0');
            this.textState.text = text;
            this.textState.fontFamily = font;
            this.textState.fontSize = size;
            this.textState.color = color;
            this.textState.rotation = rotation;
            this.updatePreview();
        };

        textInput?.addEventListener('input', updatePreview);
        fontFamily?.addEventListener('change', updatePreview);
        fontSize?.addEventListener('input', updatePreview);
        textColor?.addEventListener('input', updatePreview);

        textRotation?.addEventListener('input', () => {
            const rotation = parseInt(textRotation.value);
            if (rotationValue) rotationValue.value = String(rotation);
            this.textState.rotation = rotation;
            updatePreview();
        });

        rotationValue?.addEventListener('input', () => {
            let rotation = parseInt(rotationValue.value) || 0;
            rotation = Math.max(0, Math.min(365, rotation));
            rotationValue.value = String(rotation);
            if (textRotation) textRotation.value = String(rotation);
            this.textState.rotation = rotation;
            updatePreview();
        });

        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const underlineBtn = document.getElementById('underlineBtn');
        const strikeBtn = document.getElementById('strikeBtn');

        const toggleStyleButton = (button: HTMLElement | null, property: keyof TextState): void => {
            if (!button) return;
            button.addEventListener('click', () => {
                (this.textState[property] as boolean) = !(this.textState[property] as boolean);
                button.classList.toggle('active');
                updatePreview();
            });
        };

        toggleStyleButton(boldBtn, 'bold');
        toggleStyleButton(italicBtn, 'italic');
        toggleStyleButton(underlineBtn, 'underline');
        toggleStyleButton(strikeBtn, 'strikethrough');
    }

    private startDragging(e: MouseEvent | TouchEvent): void {
        e.preventDefault();
        const textModal = document.getElementById('textModal');
        if (!textModal) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const rect = textModal.getBoundingClientRect();

        this.modalDrag = {
            active: true,
            startX: clientX,
            startY: clientY,
            offsetX: rect.left - clientX,
            offsetY: rect.top - clientY,
        };

        textModal.style.cursor = 'grabbing';
    }

    private drag(e: MouseEvent | TouchEvent): void {
        if (!this.modalDrag.active) return;
        e.preventDefault();

        const textModal = document.getElementById('textModal');
        if (!textModal) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const left = clientX + this.modalDrag.offsetX;
        const top = clientY + this.modalDrag.offsetY;

        textModal.style.left = left + 'px';
        textModal.style.top = top + 'px';
        textModal.style.transform = 'none';
    }

    private stopDragging(): void {
        const textModal = document.getElementById('textModal');
        if (textModal && this.modalDrag.active) {
            textModal.style.cursor = 'grab';
            this.modalDrag.active = false;
        }
    }

    private updatePreview(): void {
        const ctx = this.paintBar.overlayCtx;
        if (!ctx) return;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (this.textState.text) {
            ctx.save();

            let fontStyle = '';
            if (this.textState.bold) fontStyle += 'bold ';
            if (this.textState.italic) fontStyle += 'italic ';
            ctx.font = `${fontStyle}${this.textState.fontSize}px ${this.textState.fontFamily}`;
            ctx.fillStyle = this.textState.color;
            ctx.textBaseline = 'middle';

            const metrics = ctx.measureText(this.textState.text);
            const textWidth = metrics.width;
            const textHeight = this.textState.fontSize;

            const centerX = this.textState.x + textWidth / 2;
            const centerY = this.textState.y + textHeight / 2;

            ctx.translate(centerX, centerY);
            ctx.rotate(this.textState.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);

            const x = this.textState.x;
            const y = this.textState.y + textHeight / 2;

            ctx.fillText(this.textState.text, x, y);

            if (this.textState.underline || this.textState.strikethrough) {
                ctx.beginPath();
                const lineWidth = Math.max(1, this.textState.fontSize / 20);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = this.textState.color;

                if (this.textState.underline) {
                    const underlineY = y + (textHeight / 2) + 1;
                    ctx.moveTo(x, underlineY);
                    ctx.lineTo(x + textWidth, underlineY);
                }

                if (this.textState.strikethrough) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + textWidth, y);
                }

                ctx.stroke();
            }

            ctx.restore();
        }
    }

    private clearPreview(): void {
        const ctx = this.paintBar.overlayCtx;
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
    }

    onMouseDown(point: Point): void {
        super.onMouseDown(point);
        this.initializeTextTool(point.x, point.y);
    }

    activate(): void {
        this.paintBar.canvas.style.cursor = 'text';
    }

    deactivate(): void {
        this.hideTextControls();
        this.resetTextState();
        this.paintBar.canvas.style.cursor = 'default';
        this.clearPreview();
    }

    private initializeTextTool(x: number, y: number): void {
        this.textState.x = x;
        this.textState.y = y;

        const textModal = document.getElementById('textModal');
        const textInput = document.getElementById('textInput') as HTMLTextAreaElement | null;
        const fontFamily = document.getElementById('fontFamily') as HTMLSelectElement | null;
        const fontSize = document.getElementById('fontSize') as HTMLInputElement | null;
        const textColor = document.getElementById('textColor') as HTMLInputElement | null;
        const textRotation = document.getElementById('textRotation') as HTMLInputElement | null;
        const rotationValue = document.getElementById('rotationValue') as HTMLInputElement | null;

        if (textModal && textInput && fontFamily && fontSize && textColor && textRotation && rotationValue) {
            textModal.classList.remove('hidden');

            textModal.style.left = '50%';
            textModal.style.top = '50%';
            textModal.style.transform = 'translate(-50%, -50%)';

            textInput.value = '';
            fontFamily.value = this.textState.fontFamily;
            fontSize.value = String(this.textState.fontSize);
            textColor.value = this.paintBar.currentColor;
            textRotation.value = String(this.textState.rotation);
            rotationValue.value = String(this.textState.rotation);

            const boldBtn = document.getElementById('boldBtn');
            const italicBtn = document.getElementById('italicBtn');
            const underlineBtn = document.getElementById('underlineBtn');
            const strikeBtn = document.getElementById('strikeBtn');

            if (boldBtn) boldBtn.classList.toggle('active', this.textState.bold);
            if (italicBtn) italicBtn.classList.toggle('active', this.textState.italic);
            if (underlineBtn) underlineBtn.classList.toggle('active', this.textState.underline);
            if (strikeBtn) strikeBtn.classList.toggle('active', this.textState.strikethrough);

            textInput.focus();
            this.clearPreview();
        }
    }

    private applyText(): void {
        const textInput = document.getElementById('textInput') as HTMLTextAreaElement | null;
        const fontFamily = document.getElementById('fontFamily') as HTMLSelectElement | null;
        const fontSize = document.getElementById('fontSize') as HTMLInputElement | null;
        const textColor = document.getElementById('textColor') as HTMLInputElement | null;
        const textRotation = document.getElementById('textRotation') as HTMLInputElement | null;

        if (textInput && fontFamily && fontSize && textColor && textRotation) {
            const text = textInput.value.trim();
            if (text === '') {
                this.hideTextControls();
                return;
            }

            this.textState = {
                ...this.textState,
                text,
                fontFamily: fontFamily.value,
                fontSize: parseInt(fontSize.value),
                color: textColor.value,
                rotation: parseInt(textRotation.value),
            };

            const ctx = this.getContext();
            ctx.save();

            let fontStyle = '';
            if (this.textState.bold) fontStyle += 'bold ';
            if (this.textState.italic) fontStyle += 'italic ';
            ctx.font = `${fontStyle}${this.textState.fontSize}px ${this.textState.fontFamily}`;
            ctx.fillStyle = this.textState.color;
            ctx.textBaseline = 'middle';

            const metrics = ctx.measureText(this.textState.text);
            const textWidth = metrics.width;
            const textHeight = this.textState.fontSize;

            const centerX = this.textState.x + textWidth / 2;
            const centerY = this.textState.y + textHeight / 2;

            ctx.translate(centerX, centerY);
            ctx.rotate(this.textState.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);

            const x = this.textState.x;
            const y = this.textState.y + textHeight / 2;

            ctx.fillText(this.textState.text, x, y);

            if (this.textState.underline || this.textState.strikethrough) {
                ctx.beginPath();
                const lineWidth = Math.max(1, this.textState.fontSize / 20);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = this.textState.color;

                if (this.textState.underline) {
                    const underlineY = y + (textHeight / 2) + 1;
                    ctx.moveTo(x, underlineY);
                    ctx.lineTo(x + textWidth, underlineY);
                }

                if (this.textState.strikethrough) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + textWidth, y);
                }

                ctx.stroke();
            }

            ctx.restore();
            this.hideTextControls();
        }
    }

    private hideTextControls(): void {
        const textModal = document.getElementById('textModal');
        if (textModal) {
            textModal.classList.add('hidden');
        }
        this.clearPreview();
    }

    private resetTextState(): void {
        this.textState = {
            text: '',
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#000000',
            rotation: 0,
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            x: 0,
            y: 0,
        };
    }
}
