export class SaveManager {
    constructor(paintBar) {
        this.paintBar = paintBar;
        this.saveBtn = document.getElementById('saveBtn');
        this.closeSaveBtn = document.getElementById('closeSaveBtn');
        this.cancelSaveBtn = document.getElementById('cancelSave');
        this.savePngBtn = document.getElementById('savePng');
        this.savePngTransparentBtn = document.getElementById('savePngTransparent');
        this.saveJpgBtn = document.getElementById('saveJpg');
        this.saveIcoBtn = document.getElementById('saveIco');
        this.saveIcoTransparentBtn = document.getElementById('saveIcoTransparent');
        this.saveModal = document.getElementById('saveModal');

        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.showSaveModal());
        }
        if (this.closeSaveBtn) {
            this.closeSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        if (this.cancelSaveBtn) {
            this.cancelSaveBtn.addEventListener('click', () => this.hideSaveModal());
        }
        if (this.savePngBtn) {
            this.savePngBtn.addEventListener('click', () => {
                this.saveImage('png', false);
                this.hideSaveModal();
            });
        }
        if (this.savePngTransparentBtn) {
            this.savePngTransparentBtn.addEventListener('click', () => {
                this.saveImage('png', true);
                this.hideSaveModal();
            });
        }
        if (this.saveJpgBtn) {
            this.saveJpgBtn.addEventListener('click', () => {
                this.saveImage('jpg', false);
                this.hideSaveModal();
            });
        }
        if (this.saveIcoBtn) {
            this.saveIcoBtn.addEventListener('click', () => {
                this.saveImage('ico', false);
                this.hideSaveModal();
            });
        }
        if (this.saveIcoTransparentBtn) {
            this.saveIcoTransparentBtn.addEventListener('click', () => {
                this.saveImage('ico', true);
                this.hideSaveModal();
            });
        }
    }

    showSaveModal() {
        if (this.saveModal) {
            this.saveModal.classList.remove('hidden');
        }
    }

    hideSaveModal() {
        if (this.saveModal) {
            this.saveModal.classList.add('hidden');
        }
    }

    saveImage(format, transparent = false) {
        if (!this.paintBar.canvas) return;

        // Create a temporary link element
        const link = document.createElement('a');
        
        // Set up the file name
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const fileName = `paint-${timestamp}${transparent ? '-v' : ''}`;

        try {
            // Create a temporary canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.paintBar.canvas.width;
            tempCanvas.height = this.paintBar.canvas.height;
            const tempCtx = tempCanvas.getContext('2d');

            switch (format.toLowerCase()) {
                case 'png':
                    link.download = `${fileName}.png`;
                    if (!transparent) {
                        // For non-transparent PNG, include opaque background first
                        tempCtx.drawImage(this.paintBar.opaqueBgCanvas, 0, 0);
                    }
                    // Then draw the main canvas
                    tempCtx.drawImage(this.paintBar.canvas, 0, 0);
                    link.href = tempCanvas.toDataURL('image/png');
                    break;

                case 'jpg':
                    link.download = `${fileName}.jpg`;
                    // JPG doesn't support transparency, use white background
                    tempCtx.fillStyle = 'white';
                    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    tempCtx.drawImage(this.paintBar.canvas, 0, 0);
                    link.href = tempCanvas.toDataURL('image/jpeg', 0.9);
                    break;

                case 'ico':
                    link.download = `${fileName}.ico`;
                    
                    // For ICO, we'll use 64x64 size centered on the canvas
                    const icoCanvas = document.createElement('canvas');
                    icoCanvas.width = 64;
                    icoCanvas.height = 64;
                    const icoCtx = icoCanvas.getContext('2d');
                    
                    // Calculate the center crop coordinates
                    const sourceWidth = Math.min(this.paintBar.canvas.width, this.paintBar.canvas.height);
                    const sourceHeight = sourceWidth;
                    const sourceX = (this.paintBar.canvas.width - sourceWidth) / 2;
                    const sourceY = (this.paintBar.canvas.height - sourceHeight) / 2;
                    
                    // Enable high-quality scaling
                    icoCtx.imageSmoothingEnabled = true;
                    icoCtx.imageSmoothingQuality = 'high';
                    
                    if (!transparent) {
                        // For non-transparent ICO, include opaque background first
                        icoCtx.drawImage(this.paintBar.opaqueBgCanvas,
                            sourceX, sourceY, sourceWidth, sourceHeight,
                            0, 0, 64, 64);
                    }
                    
                    // Then draw the main canvas
                    icoCtx.drawImage(this.paintBar.canvas,
                        sourceX, sourceY, sourceWidth, sourceHeight,
                        0, 0, 64, 64);
                    
                    link.href = icoCanvas.toDataURL('image/png');
                    break;

                default:
                    console.error('Unsupported format:', format);
                    return;
            }

            // Trigger the download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            this.hideSaveModal();
        } catch (error) {
            console.error('Error saving image:', error);
        }
    }
}
